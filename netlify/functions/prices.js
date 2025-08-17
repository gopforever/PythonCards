// Netlify Function: prices
// Proxies SportsCardsPro API and hides token.
// Supported query params:
//   type=products&q=...   -> /api/products (search list)
//   type=product&id=...   -> /api/product by id
//   type=product&q=...    -> /api/product by search (best match)

export default async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "products";
  const q = url.searchParams.get("q") || "";
  const id = url.searchParams.get("id") || "";
  const token = Netlify.env.get("SPORTSCARDSPRO_TOKEN");

  if (!token) {
    return new Response(JSON.stringify({ status: "error", "error-message": "Missing SPORTSCARDSPRO_TOKEN" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let target = "";
  if (type === "product" && id) {
    target = `https://www.sportscardspro.com/api/product?t=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`;
  } else if (type === "product" && q) {
    target = `https://www.sportscardspro.com/api/product?t=${encodeURIComponent(token)}&q=${encodeURIComponent(q)}`;
  } else {
    // default: products search
    const qs = new URLSearchParams({ t: token, q });
    target = `https://www.sportscardspro.com/api/products?${qs.toString()}`;
  }

  try {
    const upstream = await fetch(target, { headers: { "accept": "application/json" } });
    const text = await upstream.text(); // forward raw text to avoid JSON parse pitfalls
    const status = upstream.status;
    const headers = {
      "content-type": upstream.headers.get("content-type") || "application/json",
      // cache for 15 minutes at the CDN and 5 minutes in browser
      "cache-control": "public, s-maxage=900, max-age=300",
    };
    return new Response(text, { status, headers });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", "error-message": String(err) }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
};
