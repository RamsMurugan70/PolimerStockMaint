// Local server: serves the app and the data API on this machine.
// Settings (all optional): PPC_PORT, PPC_HOST, PPC_DATA_DIR, PPC_PUBLISH_KEY
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { handle } = require('./api');
const { makeStorage } = require('./storage');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(process.env.PPC_DATA_DIR || path.join(ROOT, 'data'));
const PORT = +(process.env.PPC_PORT || 8091);
const HOST = process.env.PPC_HOST || '127.0.0.1';
const MAX_BODY = 30 * 1024 * 1024;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function loadKey() {
  if (process.env.PPC_PUBLISH_KEY) return process.env.PPC_PUBLISH_KEY;
  const file = path.join(DATA_DIR, 'publish-key.txt');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const key = crypto.randomBytes(12).toString('base64url');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, key + '\n');
  return key;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body, type, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, extra));
  res.end(body);
}

function serveStatic(pathname, res) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { return send(res, 400, 'Bad request', 'text/plain'); }
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(PUBLIC, '.' + rel);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, buf, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

const storage = makeStorage(DATA_DIR);
const publishKey = loadKey();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
    return serveStatic(url.pathname, res);
  }
  try {
    const body = req.method === 'GET' ? Buffer.alloc(0) : await readBody(req);
    const out = await handle({ method: req.method, path: url.pathname, query: url.searchParams, key: req.headers['x-publish-key'], body }, storage, publishKey);
    send(res, out.status, JSON.stringify(out.json), 'application/json');
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, JSON.stringify({ error: e.status === 413 ? 'That is too large to upload.' : 'Something went wrong on the server.' }), 'application/json');
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. The app may already be running: try http://localhost:${PORT}/`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`Stock & Dispatch is running at http://localhost:${PORT}/`);
  console.log(`Data folder: ${DATA_DIR}`);
  console.log('Publisher key: see publish-key.txt in the data folder. Keep this window open while using the app.');
});
