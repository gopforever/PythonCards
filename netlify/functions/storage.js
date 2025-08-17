import { createClient } from '@netlify/blobs';

const client = createClient();

function normCol(v){ const s=(v||'').trim(); return s ? s : 'Personal'; }
function resp(code, obj){ return { statusCode: code, headers: { 'content-type':'application/json', 'cache-control':'no-store' }, body: JSON.stringify(obj) }; }

export async function handler(event) {
  try {
    const method = event.httpMethod || 'GET';
    const params = event.queryStringParameters || {};
    const user = (params.user || '').trim();
    const collection = normCol(params.collection || params.col || 'Personal');

    if (method === 'GET') {
      if (!user) return resp(400, { error: 'missing user' });
      const key = `cardtrack/inventory/${encodeURIComponent(user)}/${encodeURIComponent(collection)}`;
      const data = await client.getJSON(key);
      return resp(200, data || { inventory: [], watchlist: [], history: [], sets: [], transactions: [] });
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body || !body.user || !body.data) return resp(400, { error: 'invalid body' });
      const col = normCol(body.collection || 'Personal');
      const key = `cardtrack/inventory/${encodeURIComponent(body.user)}/${encodeURIComponent(col)}`;
      await client.setJSON(key, body.data);
      return resp(200, { ok: true });
    }

    return resp(405, { error: 'Method Not Allowed' });
  } catch (err) {
    return resp(502, { error: 'storage_failed', detail: String(err) });
  }
}
