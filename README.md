# Portfolio Analytics & P&L — CardTrack Pro

## What’s included
- **Analytics panel** (sidebar → Analytics): Market Value, Holdings Cost, Unrealized P/L, Realized P/L, ROI.
- **Charts**: Allocation by Set (doughnut) and Top Winners/Losers (bar).
- **Transactions ledger**: per-item **Txn** link to add **BUY/SELL** (amount, qty, fees, date, note).
- **Method**: Average Cost accounting. Sales realize P/L; remaining holdings carry updated average cost.
- **Persistence**: `transactions[]` stored with your collection in Netlify Blobs. JSON export/import included.

## Deploy
1. Replace your files with this bundle.
2. Ensure your Netlify env has `SPORTSCARDSPRO_TOKEN` (unchanged).
3. Deploy.

## Notes
- If you’ve never used the new ledger, Unrealized P/L uses each item’s `costBasisCents` as a fallback, so nothing breaks.
- You can import a ledger JSON at any time; analytics will recalc immediately.
- ROI shown is **on current holdings**: `Unrealized / Holdings Cost`. A global “Total P&L” equals `Realized + Unrealized`.
