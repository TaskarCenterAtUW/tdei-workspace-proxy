const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const https = require('https');
const zlib = require('zlib');

const app = express();
const PORT = 8000;

const ENV_MAP = {
  dev: 'https://osm.workspaces-dev.sidewalks.washington.edu',
  stage: 'https://osm.workspaces-stage.sidewalks.washington.edu',
  prod: 'https://osm.workspaces.sidewalks.washington.edu',
};

// -----------------------------
// BATCHED FILE LOGGING SETUP
// -----------------------------
const logBuffer = {};
const flushInterval = 2000;

setInterval(() => {
  for (const [env, messages] of Object.entries(logBuffer)) {
    if (!messages.length) continue;
    const date = moment().format('DD_MM_YYYY');
    const filename = `log_${date}.txt`;
    const logDir = path.join('./logs', env.toLowerCase());
    const logPath = path.join(logDir, filename);
    const batch = messages.join('\n') + '\n';
    logBuffer[env] = [];
    fs.ensureDir(logDir)
      .then(() => fs.appendFile(logPath, batch))
      .catch(console.error);
  }
}, flushInterval);

const logToFile = (env, line) => {
  if (!logBuffer[env]) logBuffer[env] = [];
  logBuffer[env].push(line);
};

// -----------------------------
// CAPTURE RAW BODY FOR POST/PUT
// -----------------------------
app.use((req, res, next) => {
  if (['POST', 'PUT'].includes(req.method)) {
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk.toString());
    req.on('end', () => {
      req.rawBody = rawBody;
      next();
    });
  } else {
    next();
  }
});

// -----------------------------
// PROXY SETUP WITH LOGGING
// -----------------------------
app.use((req, res, next) => {
  const segments = req.url.split('/').filter(Boolean);
  const env = segments[0];
  const target = ENV_MAP[env];
  if (!target) return res.status(400).send('Invalid environment prefix in URL');
  const proxiedPath = '/' + segments.slice(1).join('/');
  
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: () => proxiedPath,
    agent: new https.Agent({ keepAlive: true }),
    
    on: {
      proxyReq: (proxyReq, req) => {
        req._startTime = Date.now();
        const xWorkspace = req.headers['x-workspace'] || '-';
        const userAgent = req.headers['user-agent'] || '-';
        const time = new Date().toISOString();
        
        if (['POST', 'PUT'].includes(req.method) && req.rawBody) {
          proxyReq.write(req.rawBody);
          logToFile(env, JSON.stringify({
            time,
            type: 'request',
            method: req.method,
            url: req.originalUrl,
            xWorkspace,
            userAgent,
            requestBody: req.rawBody
          }));
        } else {
          logToFile(env, `{"time":"${time}","type":"request","method":"${req.method}","url":"${req.originalUrl}","xWorkspace":"${xWorkspace}","userAgent":"${userAgent}"}`);
        }
      },
      
      proxyRes: (proxyRes, req) => {
        const shouldLogBody = ['POST', 'PUT'].includes(req.method);
        const chunks = [];
        
        if (shouldLogBody) {
          proxyRes.on('data', chunk => chunks.push(chunk));
        }
        
        proxyRes.on('end', () => {
          const now = new Date().toISOString();
          const duration = req._startTime ? `${Date.now() - req._startTime}ms` : '-';
          const contentLength = proxyRes.headers['content-length'] || '-';
          const statusCode = proxyRes.statusCode;
          
          if (!shouldLogBody) {
            logToFile(env, `{"time":"${now}","type":"response","method":"${req.method}","url":"${req.originalUrl}","statusCode":${statusCode},"contentLength":"${contentLength}","duration":"${duration}"}`);
          } else {
            try {
              const encoding = proxyRes.headers['content-encoding'];
              let body = Buffer.concat(chunks);
              const MAX_LOG_BYTES = 512_000;
              
              if (body.length <= MAX_LOG_BYTES) {
                if (encoding === 'gzip') body = zlib.gunzipSync(body);
                else if (encoding === 'br') body = zlib.brotliDecompressSync(body);
                else if (encoding === 'deflate') body = zlib.inflateSync(body);
                
                const responseBody = body.toString('utf-8');
                logToFile(env, JSON.stringify({
                  time: now,
                  type: 'response',
                  method: req.method,
                  url: req.originalUrl,
                  statusCode,
                  contentLength,
                  duration,
                  responseBody
                }));
              } else {
                logToFile(env, JSON.stringify({
                  time: now,
                  type: 'response',
                  method: req.method,
                  url: req.originalUrl,
                  statusCode,
                  contentLength,
                  duration,
                  responseBody: '[Truncated: body exceeded 500KB]'
                }));
              }
            } catch (err) {
              logToFile(env, JSON.stringify({
                time: now,
                type: 'response',
                method: req.method,
                url: req.originalUrl,
                statusCode,
                contentLength,
                duration,
                responseBody: `[Error decoding body: ${err.message}]`
              }));
            }
          }
        });
      }
    }
    
  })(req, res, next);
});

// -----------------------------
// START SERVER
// -----------------------------
app.listen(PORT, () => {
  console.log(`Proxy server is running at http://localhost:${PORT}`);
});
