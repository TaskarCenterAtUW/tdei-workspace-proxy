const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const https = require('https');
const zlib = require('zlib');

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

// No express.json()/urlencoded()—let proxy handle raw body for maximum compatibility

app.use((req, res, next) => {
  const segments = req.url.split('/').filter(Boolean);
  const env = segments[0];
  const target = ENV_MAP[env];
  if (!target) return res.status(400).send('Invalid environment prefix in URL');
  const proxiedPath = '/' + segments.slice(1).join('/');
  
  const xWorkspace = req.headers['x-workspace'];
  const workspaceLog = xWorkspace ? ` | X-Workspace: ${xWorkspace}` : '';
  
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: () => proxiedPath,
    agent: new https.Agent({ keepAlive: false }),
    on: {
      proxyReq: (proxyReq, req, res) => {
        void logToFile(
          env,
          `REQUEST -> ${req.method} ${req.originalUrl}${workspaceLog}\nRequest Headers: ${JSON.stringify(req.headers, null, 2)}`
        );
      },
      proxyRes: (proxyRes, req, res) => {
        const contentLength = Number(proxyRes.headers['content-length']);
        const encoding = proxyRes.headers['content-encoding'];
        const shouldLogBody = !isNaN(contentLength) && contentLength < 100;
        let chunks = [];
        
        if (shouldLogBody) {
          proxyRes.on('data', chunk => {
            chunks.push(chunk);
          });
          proxyRes.on('end', () => {
            let responseBody = Buffer.concat(chunks);
            // Decompress if needed
            try {
              if (encoding === 'gzip') {
                responseBody = zlib.gunzipSync(responseBody);
              } else if (encoding === 'br') {
                responseBody = zlib.brotliDecompressSync(responseBody);
              } else if (encoding === 'deflate') {
                responseBody = zlib.inflateSync(responseBody);
              }
              responseBody = responseBody.toString('utf-8');
            } catch (err) {
              responseBody = `[Error decoding body: ${err.message}]`;
            }
            void logToFile(
              env,
              `Response for ${req.method} ${req.originalUrl}\nResponse Headers: ${JSON.stringify(proxyRes.headers, null, 2)}\nBody: ${responseBody.slice(0, 2000)}`
            );
          });
        } else {
          proxyRes.on('end', () => {
            void logToFile(
              env,
              `Response for ${req.method} ${req.originalUrl}\nResponse Headers: ${JSON.stringify(proxyRes.headers, null, 2)} [body not logged]`
            );
          });
        }
      }
    }
  })(req, res, next);
});

app.listen(8000, () => {
  console.log('Proxy server is running at http://localhost:8000');
});
