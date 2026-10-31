// Run with: npm test
// Checks the publish rules of the server, and that a viewer cannot reach anything private.
const assert = require('assert'), path = require('path'), os = require('os'), fs = require('fs');
const { spawn } = require('child_process');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-test-'));
  const PORT = 8098, base = `http://127.0.0.1:${PORT}`, KEY = 'test-key';
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], { env: Object.assign({}, process.env, { PPC_PORT: PORT, PPC_DATA_DIR: dir, PPC_PUBLISH_KEY: KEY }), stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/data'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
    const put = (body, key = KEY, set = 'stock') => fetch(`${base}/api/data/${set}`, { method: 'PUT', headers: { 'x-publish-key': key }, body: JSON.stringify(body) });
    const data = { coils: [{ id: 'C1', itemCode: 'X', status: 'stock' }], dispatches: [] };

    assert.deepStrictEqual(await (await fetch(base + '/api/data')).json(), {}, 'nothing published at first');
    assert.strictEqual((await put({ data, baseRev: 0 }, 'wrong')).status, 401, 'wrong key refused');
    assert.strictEqual((await fetch(`${base}/api/data/stock`, { method: 'PUT', body: '{}' })).status, 401, 'no key refused');
    assert.strictEqual((await put({ data: { items: [] }, baseRev: 0 })).status, 400, 'records need a coil list');
    assert.strictEqual((await put({ data, baseRev: 0 }, KEY, 'nonsense')).status, 404, 'unknown data set refused');
    assert.strictEqual((await put({ data, baseRev: 0 })).status, 200, 'publish works');
    assert.strictEqual((await put({ data, baseRev: 0 })).status, 409, 'stale version refused');
    assert.strictEqual((await put({ data, baseRev: 0, force: true })).status, 200, 'replace when confirmed');

    const pub = await (await fetch(base + '/api/data')).json();
    assert.strictEqual(pub.stock.rev, 2);
    assert.deepStrictEqual(pub.stock.data, data);
    assert.strictEqual(fs.readdirSync(path.join(dir, 'archive', 'versions')).length, 2, 'every version kept');

    const up = await fetch(`${base}/api/files?set=stock&name=..%2F..%2Fevil.xlsx`, { method: 'POST', headers: { 'x-publish-key': KEY }, body: 'bytes' });
    assert.strictEqual(up.status, 200);
    assert.ok(fs.readdirSync(path.join(dir, 'archive', 'files'))[0].endsWith('evil.xlsx'), 'file name cannot leave the archive folder');

    assert.strictEqual((await fetch(base + '/..%2f..%2fserver%2fserver.js')).status, 403, 'cannot read outside public');
    assert.strictEqual((await fetch(base + '/')).status, 200, 'the app opens at the plain link');
    console.log('all passed');
  } catch (e) {
    console.log('FAIL  ' + e.message);
    process.exitCode = 1;
  } finally {
    srv.kill();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})();
