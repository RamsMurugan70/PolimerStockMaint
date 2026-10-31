// Keeps the published data on disk:
//   <dir>/sets/<set>.json              the latest version of each data set
//   <dir>/archive/versions/...         every version ever published
//   <dir>/archive/files/...            every workbook uploaded by the publisher
const fs = require('fs'), path = require('path');

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function makeStorage(dir) {
  const setsDir = path.join(dir, 'sets'), versionsDir = path.join(dir, 'archive', 'versions'), filesDir = path.join(dir, 'archive', 'files');
  [setsDir, versionsDir, filesDir].forEach(d => fs.mkdirSync(d, { recursive: true }));

  return {
    async getSet(set) {
      try { return JSON.parse(await fs.promises.readFile(path.join(setsDir, set + '.json'), 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async putSet(set, value) {
      const text = JSON.stringify(value), target = path.join(setsDir, set + '.json'), tmp = target + '.tmp';
      await fs.promises.writeFile(tmp, text);
      await fs.promises.rename(tmp, target);
      await fs.promises.writeFile(path.join(versionsDir, `${stamp()}-${set}-v${value.rev}.json`), text);
    },
    async keepFile(set, name, bytes) {
      const safe = path.basename(String(name)).replace(/[^\w .()-]/g, '_').slice(0, 120) || 'upload.xlsx';
      await fs.promises.writeFile(path.join(filesDir, `${stamp()}-${set}-${safe}`), bytes);
    }
  };
}

module.exports = { makeStorage };
