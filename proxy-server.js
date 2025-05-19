const express = require('express');
const {createProxyMiddleware, responseInterceptor} = require('http-proxy-middleware');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const zlib = require('zlib');
const https = require('https');

const app = express();

const ENV_MAP = {
  dev: 'https://osm.workspaces-dev.sidewalks.washington.edu',
  stage: 'https://osm.workspaces-stage.sidewalks.washington.edu',
  prod: 'https://osm.workspaces.sidewalks.washington.edu',
};

const logToFile = async (env, message, logResponse = true) => {
  const date = moment().format('DD_MM_YYYY');
  const subfolder = env.toLowerCase();
  const filename = `log_${date}.txt`;
  const logDir = path.join('./logs', subfolder);
  const logPath = path.join(logDir, filename);
  const logEntry = `[${new Date().toISOString()}] ${message}\n`;
  
  try {
    await fs.ensureDir(logDir);
    await fs.appendFile(logPath, logEntry);
    if (logResponse) console.log(`[${env}] ${message}`);
  } catch (err) {
    console.error(`[Log Error] ${err.message}`);
  }
};

app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('xml')) {
    let rawData = '';
    req.setEncoding('utf8');
    req.on('data', chunk => rawData += chunk);
    req.on('end', () => {
      req.body = rawData;
      next();
    });
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    selfHandleResponse: true,
    agent: new https.Agent({keepAlive: false}),
    on: {
      proxyReq: (proxyReq, req, res) => {
        const contentType = req.headers['content-type'] || '';
        const xWorkspace = req.headers['x-workspace'];
        const workspaceLog = xWorkspace ? ` | X-Workspace: ${xWorkspace}` : '';
        const method = req.method.toUpperCase();
        
        // Build query param string
        const queryParams = Object.keys(req.query || {}).length > 0
          ? `\nQuery: ${JSON.stringify(req.query)}`
          : '';
        
        let bodyParams = '';
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          if (contentType.includes('xml') && typeof req.body === 'string') {
            bodyParams = `\nBody (XML): ${req.body.slice(0, 2000)}...`;
            
            // Manually write body to proxy request
            proxyReq.setHeader('Content-Length', Buffer.byteLength(req.body));
            proxyReq.write(req.body);
          } else if (typeof req.body === 'object') {
            const jsonBody = JSON.stringify(req.body);
            bodyParams = `\nBody (JSON): ${jsonBody}`;
            
            proxyReq.setHeader('Content-Length', Buffer.byteLength(jsonBody));
            proxyReq.write(jsonBody);
          }
        }
        
        void logToFile(env, `REQUEST -> ${method} ${req.originalUrl}${workspaceLog}${queryParams ? ' |' + queryParams : ''}${bodyParams ? ' |' + bodyParams : ''}`);
      },
      proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        const contentType = proxyRes.headers['content-type'] || '';
        let bodyStr = '';
        let decoded;
        
        try {
          const encoding = proxyRes.headers['content-encoding'];
          decoded = responseBuffer;
          
          if (encoding === 'gzip') {
            decoded = zlib.gunzipSync(responseBuffer);
          } else if (encoding === 'br') {
            try {
              decoded = zlib.brotliDecompressSync(responseBuffer);
            } catch (brErr) {
              // fallback if Brotli is incorrectly labeled
              console.warn(`[${env}] Brotli decode failed: ${brErr.message}. Falling back to raw buffer.`);
              decoded = responseBuffer;
            }
          } else if (encoding === 'deflate') {
            decoded = zlib.inflateSync(responseBuffer);
          }
          
          bodyStr = decoded.toString('utf8');
        } catch (e) {
          bodyStr = `<Error decoding body: ${e.message}>`;
        }
        
        if (contentType.includes('xml') || contentType.includes('json')) {
          void logToFile(env, `RESPONSE <- ${req.method} ${req.originalUrl} | STATUS: ${proxyRes.statusCode}\nBODY:\n${bodyStr.slice(0, 2000)}...`, false);
        } else if (contentType.includes('text')) {
          void logToFile(env, `RESPONSE <- ${req.method} ${req.originalUrl} | STATUS: ${proxyRes.statusCode}\nBODY:\n${bodyStr}...`, false);
        } else {
          void logToFile(env, `RESPONSE <- ${req.method} ${req.originalUrl} | STATUS: ${proxyRes.statusCode} (non-text content)`, false);
        }
        
        return responseBuffer;
      })
    }
    
  })(req, res, next);
});

app.listen(8000, () => {
  console.log('TDEI Workspace Proxy server is running at http://localhost:8000');
});
