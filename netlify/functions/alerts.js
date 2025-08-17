import { createClient } from '@netlify/blobs';
const client = createClient();

export default async (req) => {
  const url = new URL(req.url);
  const method = req.method || 'GET';
  const user = (url.searchParams.get('user') || '').trim() || 'guest';
  const key = `cardtrack/alerts/notifications/${encodeURIComponent(user)}.json`;

  if (method === 'GET') {
    const data = await client.getJSON(key);
    const payload = data || { unread: 0, items: [] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json', 'cache-control':'no-store' } });
  }

  if (method === 'POST') {
    const body = await req.json().catch(()=>null);
    if (!body || !body.action) return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400, headers: { 'content-type':'application/json' } });
    if (body.action === 'clear') {
      await client.setJSON(key, { unread: 0, items: [] });
      return new Response(JSON.stringify({ ok:true }), { status: 200, headers: { 'content-type':'application/json' } });
    }
    if (body.action === 'ack') {
      const data = (await client.getJSON(key)) || { unread:0, items:[] };
      data.unread = 0;
      await client.setJSON(key, data);
      return new Response(JSON.stringify({ ok:true }), { status: 200, headers: { 'content-type':'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400, headers: { 'content-type':'application/json' } });
  }

  return new Response('Method Not Allowed', { status: 405 });
};