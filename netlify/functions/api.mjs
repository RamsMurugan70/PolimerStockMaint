// Runs the same data API as the local server, on Netlify.
import api from '../../server/api.js';
import { makeBlobStorage } from '../../server/blob-storage.mjs';

const reply = (status, json) => new Response(JSON.stringify(json), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
});

export default async req => {
  const publishKey = process.env.PPC_PUBLISH_KEY;
  if (req.method !== 'GET' && !publishKey) return reply(503, { error: 'Publishing is not set up yet: the publisher key is missing.' });
  try {
    const url = new URL(req.url);
    const body = req.method === 'GET' ? Buffer.alloc(0) : Buffer.from(await req.arrayBuffer());
    const out = await api.handle({ method: req.method, path: url.pathname, query: url.searchParams, key: req.headers.get('x-publish-key'), body }, makeBlobStorage(), publishKey);
    return reply(out.status, out.json);
  } catch (e) {
    console.error(e);
    return reply(500, { error: 'Something went wrong on the server.' });
  }
};

export const config = { path: '/api/*' };
