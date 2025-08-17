# Functions Patch (502 fix)

This patch switches to **classic Netlify Functions** signatures and `process.env` to avoid 502s.

## What to do
1. Unzip and replace your repo's `netlify/functions/` folder with the one in this zip.
2. Ensure the env var is set in Netlify → Site settings → Environment:
   - `SPORTSCARDSPRO_TOKEN` = your SportsCardsPro API token
3. Redeploy.

## Notes
- Storage uses Netlify **Blobs** (`@netlify/blobs`) as before.
- Responses include clearer JSON errors if something goes wrong.
- Frontend code stays the same — this is a serverless-only patch.

If you still see a 502 after this, check the **Function logs** in Netlify to see the exact error payload returned by `storage` or `prices`.
