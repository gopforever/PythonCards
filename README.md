# CardTrack Pro — Set Completion Tracker

Drop-in feature:
- Toggle **Sets** panel in the sidebar to see progress bars.
- Click **+ Add** to create a tracked set (uses SportsCardsPro products search).
- Or use **☆ Track Set** on any search result to add its set.
- Progress is computed by comparing set product IDs to your inventory IDs.
- Data persists with your **user + collection** in Netlify Blobs.

## Netlify Function
- `setlist.js`: `GET /.netlify/functions/setlist?q=<set name>` → `{ title, total, cards:[{id,name,number?}] }`
