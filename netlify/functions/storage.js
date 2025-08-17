import { createClient } from '@netlify/blobs';
const client = createClient();
export default async (req) => {
  const url = new URL(req.url);
  const method = req.method || 'GET';
  const user = (url.searchParams.get('user') || '').trim();
  if (method === 'GET') {
    if (!user) return new Response(JSON.stringify({ error: 'missing user' }), { status: 400, headers: { 'content-type': 'application/json' } });
    const key = `cardtrack/inventory/${encodeURIComponent(user)}`;
    const data = await client.getJSON(key);
    return new Response(JSON.stringify(data || { inventory: [], watchlist: [], history: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (method === 'POST') {
    const body = await req.json().catch(()=>null);
    if (!body || !body.user || !body.data) return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400, headers: { 'content-type': 'application/json' } });
    const key = `cardtrack/inventory/${encodeURIComponent(body.user)}`;
    await client.setJSON(key, body.data);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('Method Not Allowed', { status: 405 });
};
