function resp(code, body, headers={}){
  return { statusCode: code, headers: { 'content-type': 'application/json', 'cache-control':'public, s-maxage=900, max-age=300', ...headers }, body: JSON.stringify(body) };
}
export async function handler(event){
  try{
    const params = event.queryStringParameters || {};
    const type = params.type || 'products';
    const q = params.q || '';
    const id = params.id || '';
    const token = process.env.SPORTSCARDSPRO_TOKEN;
    if (!token) return resp(500, {status:'error', 'error-message':'Missing SPORTSCARDSPRO_TOKEN'});

    let target = '';
    if (type === 'product' && id) target = `https://www.sportscardspro.com/api/product?t=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`;
    else if (type === 'product' && q) target = `https://www.sportscardspro.com/api/product?t=${encodeURIComponent(token)}&q=${encodeURIComponent(q)}`;
    else {
      const qs = new URLSearchParams({ t: token, q });
      target = `https://www.sportscardspro.com/api/products?${qs.toString()}`;
    }

    const upstream = await fetch(target, { headers: { accept:'application/json' } });
    const text = await upstream.text();
    return { statusCode: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control':'public, s-maxage=900, max-age=300' }, body: text };
  } catch(err){
    return resp(502, { status:'error', 'error-message': String(err) });
  }
}
