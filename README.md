# Watchlist Price Alerts — CardTrack Pro

## Features
- Per-card alert rules: **≤ below**, **≥ above**, **% drop/rise**, **52-week high/low**, **Buy price**
- In-app **bell** with unread count, notifications panel, refresh & clear
- **Scheduled functions**:
  - `alerts_scan` — runs every 30 minutes, checks all watchlist items
  - `alerts_digest` — daily summary

## Setup
1. Set Netlify env vars:
   - `SPORTSCARDSPRO_TOKEN` = your SportsCardsPro API token
   - `ALERT_USER` = your username in the app (defaults to `guest`)

2. Deploy. Netlify will automatically run the schedules declared in the functions.

## Notes
- Alerts operate on the **active price key** (you can change it per item when setting alerts).
- Notifications persist in Blobs: `cardtrack/alerts/notifications/<user>.json`.
- The scan function stores per-item price history (last 365 days) at `cardtrack/alerts/state/<user>.json` for 52-week checks.
