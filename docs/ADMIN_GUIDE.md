# Wavio admin guide

Wavio answers guests on WhatsApp for you — rooms and rates, photos, location, timings, pickups, bookings — and hands anything that needs a decision to your team.

## Your day
1. **Home** – a glance: arrivals, in-house guests, what needs attention, setup progress.
2. **Requests** – the main inbox for decisions. Guests ask the bot for a booking, cancellation, pickup, etc.; they land here.
   - *Booking*: press **Approve**. Optionally set an **advance** (₹): the guest gets a payment link and the stay is confirmed when they pay. With no advance it is confirmed immediately and the confirmation / reminder / review messages start.
   - A red banner means the room is already full on those dates; you can still approve ("overbook") deliberately.
   - Anything else: **Mark done**, or **Decline** with a message to the guest.
3. **Inbox** – every chat. Reply yourself any time; the bot stops while you're replying. *Resume bot* hands the chat back. Use **Saved replies** for answers you send often. 🤖 marks messages the bot sent.
4. **Stays** – room calendar (who is in which room), today's arrivals/departures, and **Add a booking** for walk-ins and phone bookings.
5. **Reports** – how many guests the bot handled alone, reply speed, bookings, ratings, busiest hours.

## Keeping the bot good
- **Test the bot** – chat as a guest with typos, Hinglish or Hindi. The side panel shows how it understood each message. *Full test* creates real requests/bookings for a pretend guest (never sent to WhatsApp); *Start over* cleans up.
- **Guest Bot → Hotel bot**
  - *Questions I couldn't answer*: guests asked, the bot had no answer. Press **Teach**, write the answer once — it answers next time.
  - *Teach it your own questions*: words to listen for + the answer (+ optional photo).
  - *What the bot says*: edit any wording. `{name}`, `{resort}` etc. are filled in automatically.
- **Guest Bot → Knowledge**: paste policies, add a web page, or upload a PDF.
- **Guest Bot → Library**: photos and brochures it can send.
- **Catalog**: rooms with price, weekend (Fri–Sat) price, how many people they sleep, how many you have. The bot quotes totals from this.

## Settings worth knowing
- **Business profile**: address, map link, check-in/out, the hours your team is online (outside them the bot tells guests when you'll reply), Google review link (sent to guests who rate you 4–5).
- **Alerts**: email / Telegram when a guest needs a person, plus a morning summary.
- **Your data**: backups, CSV downloads, clear test data.
- **Team**: add staff with their own logins. **Activity log** shows who changed what.

## What the bot will and won't do
It answers only from what you've entered (rooms, rates, answers, knowledge). It never confirms a booking, promises availability or gives discounts — those go to **Requests**. If it doesn't understand twice, or the guest sounds upset or asks for a person, it hands over and you're alerted.

## Troubleshooting
- *Bot isn't replying*: Guest Bot → Behaviour → both boxes ticked? In the Inbox, is *Resume bot* showing on that chat? Is WhatsApp connected (Settings)?
- *A guest got a wrong answer*: open Test the bot, type their exact message, and fix the answer or teach a new one.
- *Messages stuck on ⏳*: the server's job loop isn't running — open `/api/health`.
