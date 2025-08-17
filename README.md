# CardTrack Pro — Netlify Blobs Edition

This build swaps localStorage persistence for **Netlify Blobs** so inventory + history sync across devices.
UI is unchanged.

## Deploy
1) Ensure your site is on Netlify.
2) `npm install` (adds @netlify/blobs for functions bundling).
3) Deploy (push/drag-drop). No env vars required.

## How it works
- New function: `/.netlify/functions/storage`
  - `GET ?user=<id>` -> returns `{ inventory, watchlist, history }`
  - `POST` body `{ user, data: { inventory, watchlist, history } }` -> saves JSON
- Frontend keeps a local cache and syncs after each change (debounced). On first load, it asks for a **Username** (just used as a key).

