const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

// Load .env
try {
  fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k) process.env[k] = v;
    }
  });
} catch (_) {}

const PORT = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.pdf':  'application/pdf',
  '.mjs':  'application/javascript',
};

// Shim for Vercel-style req/res so our API handlers run unchanged
function shimReq(req, body, query) {
  return Object.assign(Object.create(req), { body, query });
}

function shimRes(res) {
  return {
    _code: 200,
    status(code)      { this._code = code; return this; },
    setHeader(k, v)   { res.setHeader(k, v); return this; },
    json(data)        { res.writeHead(this._code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); },
    end()             { res.writeHead(this._code); res.end(); },
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => buf += c);
    req.on('end',  () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

const API_ROUTES = {
  '/api/create-checkout-session': './api/create-checkout-session',
  '/api/get-session':             './api/get-session',
};

http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  // ── API ──
  const handlerPath = API_ROUTES[pathname];
  if (handlerPath) {
    try {
      const body    = await readBody(req);
      const handler = require(handlerPath);
      await handler(shimReq(req, body, query), shimRes(res));
    } catch (err) {
      console.error('[API error]', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── Static files ──
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  if (!path.extname(filePath)) filePath += '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });

}).listen(PORT, () => {
  console.log(`\n  MrShine dev server → http://localhost:${PORT}\n`);
  const key = process.env.STRIPE_SECRET_KEY;
  if (key) {
    console.log(`  Stripe key: ${key.slice(0, 8)}… ✓`);
  } else {
    console.log('  ⚠  STRIPE_SECRET_KEY not set — create a .env file (see .env.example)');
  }
  console.log('');
});
