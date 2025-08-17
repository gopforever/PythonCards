# CardTrack Pro (Netlify)

A polished Netlify site for serious sports card hobbyists, buyers, and sellers — with live pricing from **SportsCardsPro** and a simple inventory tracker saved in your browser.

## Features
- 🔎 **Fast price search** (players, sets, years, card #) — first 20 matches
- 💵 **Live prices** via SportsCardsPro (ungraded + graded fields when available)
- 📦 **Inventory tracking** with quantities, grade selection, cost basis & notes
- 📈 **Portfolio snapshot** — items, est. value, cost basis, P/L
- ⭐ **Watchlist**
- ⬇️ **Export / Import** your data (JSON)

## How it works
- Frontend: static HTML + Tailwind + vanilla JS
- Pricing API is called via a **Netlify Function** at `/.netlify/functions/prices` which proxies to `https://www.sportscardspro.com/api/*` and **keeps your token private**.

> ⚠️ Netlify Functions run in Node (JS/TS) — Python runtimes aren't supported for Functions. (We still support Python in builds if needed.)

## One‑time setup
1. **Create a new Netlify site** from this folder (or `netlify init`).
2. In your site **Environment variables**, add:
   - `SPORTSCARDSPRO_TOKEN` = `<your 40‑char API token>`
3. (Optional) Install the CLI and run locally:
   ```bash
   npm i -g netlify-cli
   netlify dev
   ```
4. **Deploy** — pushing to your repo will auto‑deploy, or run:
   ```bash
   netlify deploy --prod
   ```

## API Reference (SportsCardsPro)
- `/api/product?t=TOKEN&id=ID` — get one product by ID
- `/api/product?t=TOKEN&q=SEARCH` — best match for a query
- `/api/products?t=TOKEN&q=SEARCH` — up to 20 matches

See the full docs: https://www.sportscardspro.com/api-documentation

---

**Notes**
- Prices are returned in **cents**; the UI formats them to dollars.
- Inventory is saved locally via `localStorage` (no backend storage).
- Feel free to customize styling in `index.html` and logic in `app.js`.
