<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f278f9f7-14a3-4b40-8c16-e78aa138625d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create a local PostgreSQL database, then apply the schema:

   ```powershell
   createdb comic_vault
   psql -d comic_vault -f db/migrations/001_initial_schema.sql
   ```

3. Copy [.env.example](.env.example) to `.env.local` and set `DATABASE_URL`. Set `GEMINI_API_KEY` too if you use cover scanning.
4. Run the app:
   `npm run dev`

### Playwright E2E (local)

If you run Playwright E2E tests locally against your PostgreSQL instance on port 3001, set DATABASE_URL and start the dev server first. Example PowerShell (replace <PASSWORD>):

```powershell
$env:DATABASE_URL = 'postgres://postgres:<PASSWORD>@localhost:3001/comic_vault'; $env:PORT = '3000'; npm run dev
npx playwright test e2e/example.spec.ts
```

(Note: do NOT commit secrets. Use .env.local for persistent env values.)

## PostgreSQL storage

Comic and box data is now stored through the app's local Express API in PostgreSQL. On the first successful connection to an empty database, the app copies the collection currently cached in the browser into PostgreSQL. Subsequent edits, imports, resets, cover changes, and deletes are persisted there.

Firebase remains only for the existing Google Drive sign-in flow; Firestore is no longer used for collection data.
