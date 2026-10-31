// The app's data API. It only talks to a storage object, so the same logic runs
// on this machine (see server.js) and on the cloud function.
//
//   GET  /api/data            public: the latest published records
//   POST /api/verify          publisher: is this key right?
//   PUT  /api/data/:set       publisher: publish a new version of one data set
//   POST /api/files?set=&name= publisher: keep a copy of an uploaded workbook
const crypto = require('crypto');

const SETS = ['stock'];

function validData(set, d) {
  if (set === 'stock') return d && Array.isArray(d.coils);
  return false;
}

function keyMatches(given, expected) {
  if (typeof given !== 'string' || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// req: { method, path, query, key, body (Buffer) }  ->  { status, json? }
async function handle(req, storage, publishKey) {
  const { method, path } = req;

  if (method === 'GET' && path === '/api/data') {
    const out = {};
    for (const set of SETS) {
      const v = await storage.getSet(set);
      if (v) out[set] = v;
    }
    return { status: 200, json: out };
  }

  const isWrite = method !== 'GET';
  if (isWrite && !keyMatches(req.key, publishKey)) return { status: 401, json: { error: 'Publisher key is not correct.' } };

  if (method === 'POST' && path === '/api/verify') return { status: 200, json: { ok: true } };

  const m = path.match(/^\/api\/data\/([a-z]+)$/);
  if (method === 'PUT' && m) {
    const set = m[1];
    if (!SETS.includes(set)) return { status: 404, json: { error: 'Unknown data set.' } };
    let body;
    try { body = JSON.parse(req.body.toString('utf8')); } catch (e) { return { status: 400, json: { error: 'Not valid JSON.' } }; }
    if (!validData(set, body.data)) return { status: 400, json: { error: `The ${set} data is empty or in the wrong shape.` } };
    const cur = await storage.getSet(set);
    const curRev = cur ? cur.rev : 0;
    if (!body.force && body.baseRev !== curRev) {
      return { status: 409, json: { error: 'A newer version has been published.', currentRev: curRev, publishedAt: cur && cur.publishedAt } };
    }
    const next = { rev: curRev + 1, publishedAt: new Date().toISOString(), source: String(body.source || '').slice(0, 300), data: body.data };
    await storage.putSet(set, next);
    return { status: 200, json: { rev: next.rev, publishedAt: next.publishedAt } };
  }

  if (method === 'POST' && path === '/api/files') {
    const set = req.query.get('set'), name = req.query.get('name');
    if (!SETS.includes(set) || !name) return { status: 400, json: { error: 'A data set and file name are required.' } };
    if (!req.body.length) return { status: 400, json: { error: 'The file is empty.' } };
    await storage.keepFile(set, name, req.body);
    return { status: 200, json: { ok: true } };
  }

  return { status: 404, json: { error: 'Not found.' } };
}

module.exports = { handle, SETS };
