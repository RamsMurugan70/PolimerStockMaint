// The cloud twin of storage.js: same three operations, kept in Netlify Blobs.
//   sets/<set>            the latest version of each data set
//   versions/...          every version ever published
//   files/...             every workbook uploaded by the publisher
import { getStore } from '@netlify/blobs';

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function makeBlobStorage() {
  const store = getStore({ name: 'stock-app', consistency: 'strong' });
  return {
    getSet: set => store.get('sets/' + set, { type: 'json' }),
    async putSet(set, value) {
      await store.setJSON('sets/' + set, value);
      await store.setJSON(`versions/${stamp()}-${set}-v${value.rev}`, value);
    },
    async keepFile(set, name, bytes) {
      const safe = String(name).split(/[\\/]/).pop().replace(/[^\w .()-]/g, '_').slice(0, 120) || 'upload.xlsx';
      await store.set(`files/${stamp()}-${set}-${safe}`, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
  };
}
