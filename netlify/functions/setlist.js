export default async (req) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return new Response(JSON.stringify({ error: "missing q" }), { status: 400, headers: { "content-type":"application/json" } });
  const token = Netlify.env.get("SPORTSCARDSPRO_TOKEN");
  if (!token) return new Response(JSON.stringify({error:"Missing SPORTSCARDSPRO_TOKEN"}),{status:500,headers:{"content-type":"application/json"}});

  // Fetch products for the query; then filter to items whose console-name matches q (case-insensitive)
  const searchUrl = `https://www.sportscardspro.com/api/products?` + new URLSearchParams({ t: token, q });
  try {
    const r = await fetch(searchUrl, { headers: { accept: "application/json" } });
    const data = await r.json();
    const products = Array.isArray(data?.products) ? data.products : (Array.isArray(data) ? data : []);

    const norm = (s) => (s||"").toString().trim().toLowerCase();
    const target = norm(q);
    const list = products.filter(p => norm(p["console-name"]) === target || norm(p["console-name"]).includes(target));

    // Build checklist: id, name, (attempt to extract card number if present)
    const items = list.map(p => {
      const name = p["product-name"] || "";
      let number = null;
      const m = name.match(/#\s*([A-Z0-9\-]+)\b/);
      if (m) number = m[1];
      return { id: p.id, name, number };
    });

    // Deduplicate by id
    const seen = new Set();
    const cards = items.filter(it => { if (seen.has(it.id)) return false; seen.add(it.id); return true; });

    return new Response(JSON.stringify({ title: q, total: cards.length, cards }), { status: 200, headers: { "content-type":"application/json", "cache-control":"public, s-maxage=600, max-age=120" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { "content-type":"application/json" } });
  }
};