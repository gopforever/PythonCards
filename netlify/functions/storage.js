import { createClient } from '@netlify/blobs';
const client = createClient();

function normCol(v){
  const s = (v||'').trim();
  return s ? s : 'Personal';
}

export default async (req) => {
  const url = new URL(req.url);
  const method = req.method || 'GET';
  const user = (url.searchParams.get('user') || '').trim();
  const collection = normCol(url.searchParams.get('collection') || url.searchParams.get('col'));

  if (method === 'GET') {
    if (!user) return new Response(JSON.stringify({ error: 'missing user' }), { status: 400, headers: { 'content-type': 'application/json' } });
    const key = `cardtrack/inventory/${encodeURIComponent(user)}/${encodeURIComponent(collection)}`;
    const data = await client.getJSON(key);
    return new Response(JSON.stringify(data || { inventory: [], watchlist: [], history: [], sets: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (method === 'POST') {
    const body = await req.json().catch(()=>null);
    if (!body || !body.user || !body.data) return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400, headers: { 'content-type': 'application/json' } });
    const col = normCol(body.collection);
    const key = `cardtrack/inventory/${encodeURIComponent(body.user)}/${encodeURIComponent(col)}`;
    await client.setJSON(key, body.data);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  return new Response('Method Not Allowed', { status: 405 });
};
