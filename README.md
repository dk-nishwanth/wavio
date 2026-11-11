# Wavio

WhatsApp inbox, chatbots, broadcasts, CRM and automations for your website, with a resort starter pack. Docs: [Wylto research and roadmap](docs/wylto-research.md).

## Run locally
```bash
npm install
cp .env.example .env.local
npm run dev      # app + job loop on http://localhost:3000
npm run seed -- <username> <password> "My Resort"   # optional first account
npm test         # 38 automated tests
```
With no WhatsApp credentials the app runs in **test mode**: messages are simulated and the inbox has a simulator. In production an unconnected number fails loudly instead.

## Going live with WhatsApp
Settings → paste Phone number ID, WABA ID, access token and app secret → **Check connection** → **Send test**. Expose the app on a public https address, then add the callback URL and verify token shown in Settings to your Meta app (field `messages`). Template messages need Meta approval; free text works only within 24 hours of the guest's last message.

## Environment
| Variable | Purpose |
|---|---|
| `APP_SECRET` | Signs sessions and derives the secrets key. 32+ random characters. **Required in production.** |
| `ENCRYPTION_KEY` | Optional separate key for encrypting stored tokens (defaults to `APP_SECRET`). Losing it makes saved tokens unreadable. |
| `APP_URL` | Public https address (webhook URLs, payment links). |
| `CRON_SECRET` | Bearer token for `/api/cron/tick` if you drive jobs from a scheduler. |
| `DATABASE_PATH` | SQLite file (default `./data/app.db`). |
| `BACKUP_DIR`, `BACKUP_KEEP`, `AUTO_BACKUP=0` | Backup folder (default `./backups`), copies kept (14), disable the daily auto-backup. |
| `MEDIA_DIR` | Where attachments are stored (default next to the database). |
| `ALLOW_DEV_TOOLS=1` | Re-enables simulators / test checkout in production. Leave unset. |
| `INLINE_WORKER=0` | Disable the in-server job loop (run `npm run worker` instead). |
| `ENFORCE_PLANS=1` | Plans/limits are **off by default** (every feature is available, Billing is hidden). Set to 1 to enforce seat, flow and scheduling limits. |
| `PLATFORM_RAZORPAY_*`, `SELLER_*` | Your own billing gateway and GST invoice seller details. |

In production the server refuses to start with placeholder secrets.

## Security
Secrets (WhatsApp token, app secret, payment keys, integration tokens) are AES-256-GCM encrypted in the database. Logins are rate limited (5 failures per user per 15 min), API keys are limited to 600 requests/min, changing a password signs out every other device, webhooks require a valid signature in production, and responses carry hardening headers.

Forgot a password? Another admin can reset it on the Team page, or run `npm run reset-password -- <username> <new-password>` on the server.

## Backups
A verified snapshot is written daily to `backups/` (last 14 kept) by the running server. Take one any time with `npm run backup`. To restore: stop the app, copy a snapshot over `data/app.db` (delete `app.db-wal` and `app.db-shm`), start the app. Attachments live in `data/media/`; back that folder up too.

## Pilot deployment (single server)
Run on one VM with a persistent disk: `npm run build && npm start`, behind HTTPS (Caddy/nginx/Cloudflare Tunnel), with the env vars above. The job loop runs inside the server. Not suitable for serverless hosts (Vercel) until the database moves to Postgres.

## Layout
`lib/` core logic (messaging, flows, CRM, billing, payments) · `app/api/` REST API · `app/(app)/` dashboard · `sdk/` React SDK · `tests/` Vitest suites · `worker.ts` standalone job runner.
