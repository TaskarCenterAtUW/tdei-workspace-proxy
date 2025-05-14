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

const logToFile = (env, message, logResponse = true) => {
  const date = moment().format('DD_MM_YYYY');
  const subfolder = env.toLowerCase();
  const filename = `log_${date}.txt`;
  const logDir = path.join('./logs', subfolder);
  const logPath = path.join(logDir, filename);
  const logEntry = `[${new Date().toISOString()}] ${message}\n`;
  
  fs.ensureDirSync(logDir);
  fs.appendFileSync(logPath, logEntry);
  
  if (logResponse) console.log(`[${env}] ${message}`);
}

app.use((req, res, next) => {
  const segments = req.url.split('/').filter(Boolean);
  const env = segments[0];
  const target = ENV_MAP[env];
  if (!target) return res.status(400).send('Invalid environment prefix in URL');
  
  const proxiedPath = '/' + segments.slice(1).join('/');
  logToFile(env, `REQUEST -> ${req.method} ${req.originalUrl}`);
  
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: () => proxiedPath,
    selfHandleResponse: true,
    agent: new https.Agent({keepAlive: false}),
    on: {
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
          logToFile(env, `RESPONSE <- ${req.method} ${req.originalUrl} | STATUS: ${proxyRes.statusCode}\nBODY:\n${bodyStr.slice(0, 1000)}...`, false);
        } else if (contentType.includes('text')) {
          logToFile(env, `RESPONSE <- ${req.method} ${req.originalUrl} | STATUS: ${proxyRes.statusCode}\nBODY:\n${bodyStr}...`, false);
        } else {
          logToFile(env, `RESPONSE <- ${req.method} ${req.originalUrl} | STATUS: ${proxyRes.statusCode} (non-text content)`, false);
        }
        
        return responseBuffer;
      })
    }
    
  })(req, res, next);
});

app.listen(8000, () => {
  console.log('TDEI Workspace Proxy server is running at http://localhost:8000');
});
