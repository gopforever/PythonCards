import { createClient } from '@netlify/blobs';
export const config = { schedule: "*/30 * * * *" }; // every 30 minutes

const client = createClient();

const COLLECTIONS = ["Personal","Sales","Trade"];
const PRICE_KEYS = ["graded-price","loose-price","new-price","cib-price","manual-only-price","bgs-10-price","condition-17-price","condition-18-price"];

const token = Netlify.env.get("SPORTSCARDSPRO_TOKEN");
const ALERT_USER = Netlify.env.get("ALERT_USER") || "guest"; // set this in Netlify env

async function getJSON(key, fallback){ const data = await client.getJSON(key); return data || fallback; }
async function setJSON(key, data){ await client.setJSON(key, data); }

async function fetchProduct(id){
  if (!token) throw new Error("Missing SPORTSCARDSPRO_TOKEN");
  const url = `https://www.sportscardspro.com/api/product?t=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`;
  const r = await fetch(url, { headers: { accept:"application/json" } });
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return await r.json();
}

function pickPrice(data, keyPref){
  const keys = [keyPref, ...PRICE_KEYS].filter(Boolean);
  for (const k of keys){
    const v = data?.[k];
    if (typeof v === "number" && v >= 0) return { key:k, cents:v };
  }
  return { key:null, cents:null };
}

function pctChange(oldCents, newCents){
  if (!oldCents || oldCents<=0) return null;
  return ((newCents - oldCents) / oldCents) * 100;
}

export default async () => {
  const user = ALERT_USER;
  for (const col of COLLECTIONS){
    const storeKey = `cardtrack/inventory/${encodeURIComponent(user)}/${encodeURIComponent(col)}`;
    const data = await getJSON(storeKey, { inventory:[], watchlist:[], history:[], sets:[] });
    const watchlist = data.watchlist || [];
    if (!watchlist.length) continue;

    const stateKey = `cardtrack/alerts/state/${encodeURIComponent(user)}.json`;
    const notifKey = `cardtrack/alerts/notifications/${encodeURIComponent(user)}.json`;
    const state = await getJSON(stateKey, { items:{} });
    const notifs = await getJSON(notifKey, { unread:0, items:[] });

    for (const w of watchlist){
      const id = w.id || w.productId || w.product?.id;
      if (!id) continue;
      let product;
      try {
        product = await fetchProduct(id);
      } catch { continue; }

      const priceSel = pickPrice(product, w.alerts?.priceKey || w.gradeKey || "loose-price");
      const nowCents = priceSel.cents;
      if (nowCents == null) continue;

      const rec = state.items[id] || { history:[] };
      const prevCents = rec.history.length ? rec.history[rec.history.length-1].priceCents : null;
      const today = new Date().toISOString().slice(0,10);
      if (!rec.history.length || rec.history[rec.history.length-1].date !== today){
        rec.history.push({ date: today, priceCents: nowCents });
        if (rec.history.length > 370) rec.history = rec.history.slice(-370);
      } else {
        rec.history[rec.history.length-1].priceCents = nowCents;
      }

      const lo52 = Math.min(...rec.history.map(h => h.priceCents));
      const hi52 = Math.max(...rec.history.map(h => h.priceCents));
      const pc = pctChange(prevCents, nowCents);
      const alerts = w.alerts || {};
      const name = w.productName || product["product-name"] || id;

      function push(type, msg){
        notifs.items.unshift({ id: `${id}-${Date.now()}-${type}`, ts: new Date().toISOString(), collection: col, productId: id, name, type, message: msg, priceCents: nowCents });
        if (notifs.items.length > 400) notifs.items = notifs.items.slice(0,400);
        notifs.unread = (notifs.unread||0)+1;
      }

      if (alerts.belowCents != null && nowCents <= alerts.belowCents) push("below", `Now ${fmtUSD(nowCents)} ≤ target ${fmtUSD(alerts.belowCents)}`);
      if (alerts.aboveCents != null && nowCents >= alerts.aboveCents) push("above", `Now ${fmtUSD(nowCents)} ≥ target ${fmtUSD(alerts.aboveCents)}`);
      if (alerts.buyCents != null && nowCents <= alerts.buyCents) push("buy", `Buy price hit: ${fmtUSD(nowCents)} ≤ ${fmtUSD(alerts.buyCents)}`);
      if (alerts.dropPct != null && pc != null && pc <= -Math.abs(alerts.dropPct)) push("drop", `Down ${pc.toFixed(1)}% to ${fmtUSD(nowCents)}`);
      if (alerts.risePct != null && pc != null && pc >= Math.abs(alerts.risePct)) push("rise", `Up ${pc.toFixed(1)}% to ${fmtUSD(nowCents)}`);

      if (alerts.hi52 && nowCents >= hi52 && hi52 === nowCents && rec.lastHi52 !== today){
        push("hi52", `New 52-week high: ${fmtUSD(nowCents)}`); rec.lastHi52 = today;
      }
      if (alerts.lo52 && nowCents <= lo52 && lo52 === nowCents && rec.lastLo52 !== today){
        push("lo52", `New 52-week low: ${fmtUSD(nowCents)}`); rec.lastLo52 = today;
      }

      state.items[id] = rec;
    }

    await setJSON(stateKey, state);
    await setJSON(notifKey, notifs);
  }

  return new Response("ok");
};

function fmtUSD(c){ return (c/100).toLocaleString(undefined,{style:"currency",currency:"USD"}); }
