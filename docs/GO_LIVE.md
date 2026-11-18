# Go-live checklist

Work top to bottom. Each step says how to check it. `npm run doctor` (or `docker compose exec app npm run doctor`) checks most of these for you.

## 1. Content (about 15 minutes, no technical skills)
- [ ] **Setup** page: resort details, rooms and rates, common answers. Progress reaches 4 of 6.
- [ ] **Guest Bot → Library**: room photos and a brochure, labelled clearly ("Safari tent photos").
- [ ] **Test the bot**: try the example messages and your own, in English, Hinglish and Hindi. Fix anything wrong under *Guest Bot → Hotel bot* (teach an answer, or edit the wording).
- [ ] **Settings → Alerts**: add an email and/or Telegram and press *Send test alert*. This is how you'll know a guest needs a person.
- [ ] **Settings → Your account**: change the password. Add each staff member under *Team* with their own login.

## 2. Hosting (once)
- [ ] A server in India (for example a small VM in Mumbai) with Docker installed. 1 vCPU / 2 GB is plenty to start.
- [ ] A domain or subdomain such as `bot.yourresort.com` pointing at the server.
- [ ] `cp .env.production.example .env.production`, fill in the secrets, then `DOMAIN=bot.yourresort.com docker compose up -d`.
- [ ] Open `https://bot.yourresort.com/api/health` — it should say `"ok": true`.
- [ ] Sign in, run **Settings → Your data → Clear test data**, then change the password again if you used a temporary one.
- [ ] Set an uptime monitor (UptimeRobot, free) on `/api/health`.
- [ ] Copy a backup off the server once a week (Settings → Your data → *Download a backup*). Daily backups are kept on the server too, but a copy elsewhere protects you if the server is lost.

## 3. WhatsApp
See `docs/WHATSAPP_SETUP.md`. In short: a Meta developer app on the Jawai Retreat business account, a WhatsApp number added to it, a permanent token, the webhook URL pasted into Meta, then **Settings → Check connection → Send test**.
- [ ] Decide which number the bot uses. **Do not move a number that staff use on the WhatsApp Business app** unless you accept that the app stops working on it.
- [ ] Message templates (booking confirmation, reminder, review request) approved by Meta — *Templates → Sync status*.
- [ ] A payment method added in WhatsApp Manager (needed for template messages).

## 4. Soft launch
- [ ] Switch the bot on only after a week of watching **Test the bot** results and **Requests**.
- [ ] First days: read every conversation in the Inbox; use *Questions I couldn't answer* to teach the bot daily.
- [ ] Put the WhatsApp link (`https://wa.me/<number>`) in the Instagram bio, replies to "price/details" comments, and the website.

## If something goes wrong
- **Bot says something wrong**: *Inbox → pause bot* on that chat, reply yourself, then fix the answer under Guest Bot → Hotel bot.
- **Bot misbehaves generally**: *Guest Bot → Behaviour* → untick *Reply automatically*. Guests then reach your team only.
- **Server problem**: `docker compose logs app`, then `docker compose restart app`.
- **Restore a backup**: stop the app, replace `/data/app.db` in the volume with the backup file (delete `app.db-wal` and `app.db-shm`), start again.
