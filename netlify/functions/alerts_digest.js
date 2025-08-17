import { createClient } from '@netlify/blobs';
export const config = { schedule: "0 13 * * *" }; // daily at 13:00 UTC
const client = createClient();
const ALERT_USER = Netlify.env.get("ALERT_USER") || "guest";
export default async () => {
  const key = `cardtrack/alerts/notifications/${encodeURIComponent(ALERT_USER)}.json`;
  const data = (await client.getJSON(key)) || { unread:0, items:[] };
  if (!data.items.length) return new Response("noop");
  const today = new Date().toISOString().slice(0,10);
  const dayItems = data.items.filter(n => (n.ts||"").slice(0,10) === today);
  if (!dayItems.length) return new Response("noop");
  data.items.unshift({ id:`digest-${Date.now()}`, ts:new Date().toISOString(), type:"digest", message:`Daily digest: ${dayItems.length} alerts`, count: dayItems.length });
  data.unread += 1;
  await client.setJSON(key, data);
  return new Response("ok");
};