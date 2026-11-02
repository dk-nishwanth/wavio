# WAConnect

WhatsApp inbox, broadcasts and automation, wired to a React website through a small SDK.

## Run locally
```bash
npm install
npm run dev        # app on http://localhost:3000
npm run worker     # second terminal: sends messages, runs waits/drips, fires webhooks
```
Sign up at `/login`. With no WhatsApp credentials the app runs in **test mode** (messages are simulated, templates auto-approve),
so you can try everything — use "Simulate an inbound message" in the Inbox and the `/demo` storefront.

## Going live with WhatsApp
1. Settings → paste Phone number ID, WABA ID, permanent token (and app secret).
2. In Meta → WhatsApp → Configuration set the callback URL + verify token shown in Settings, subscribe to `messages`.
3. Create templates; they are submitted to Meta and sync back with "Sync status".

## Architecture
- Next.js app (UI + REST API) · SQLite (`node:sqlite`, schema in `lib/db.ts`) · DB-backed job queue (`lib/queue.ts`) · worker (`worker.ts`)
- `lib/core.ts` messaging, 24h-window + opt-in rules, inbound handling, campaigns, outbound webhooks
- `lib/automation.ts` event/keyword/first-message triggers; steps: text, template, buttons, wait (+cancel-on-event), tag, assign, http
- `app/api/v1/*` public API (public key for browser, secret key for server) · `sdk/index.tsx` React SDK · `app/demo` sample site

## Production notes
- SQLite is for a single server. For serverless hosting (e.g. Vercel) swap `lib/db.ts` for Postgres; keep the worker on a long-running host or call `/api/cron/tick` every minute with `Authorization: Bearer $CRON_SECRET`.
- Set a real `APP_SECRET`. Bare 10-digit numbers are assumed to be Indian (+91) — see `normalizePhone`.
