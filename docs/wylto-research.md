# Wylto research and Wavio gap analysis

Prepared 2026-11-11 from public pages only (wylto.com, its docs, terms and privacy pages, third-party listings). No account was created and nothing behind a login was seen. Wylto's API is not publicly documented, so anything about its internals is inference and is marked as such.

Source quality: product facts come from Wylto's own pages (self-reported). Third-party coverage is thin: no G2, Capterra, Trustpilot or Reddit reviews were found, so there is no verified user feedback.

## 1. What Wylto is

A WhatsApp growth platform (Wylto Solutions LLP, T-Hub Hyderabad) built on the official WhatsApp Business API. Pitch: capture leads from ads and forms, engage them with bots and AI agents, segment them, convert with workflows. Verticals on the site: real estate (most developed), e-commerce, hotels, digital marketing. Customer proof is nine logos and an unsourced "10 million interactions" claim.

## 2. Wylto feature inventory (as documented)

**Connection and onboarding**
- Facebook login then "Get Started". Either a display name only (Wylto assigns a virtual number) or an existing number that is not active on WhatsApp.
- Wylto's team migrates the number. Docs say 24-48 hours; the homepage says "minutes". One app = one WABA = one subscription.
- Settings has Re-register Number with a "migrating from another business" option.

**Chatbot builder**
- Visual editor. Message formats: text, image, buttons, list, video, audio, document, URL button, location.
- Questions: buttons, list, name, email, date, text, number, image, document, location, audio, with a fallback for invalid input.
- Other blocks: connect to another flow, update contact (status, tag, event date, assignment, group, custom fields), add/remove tag and segment, send catalog, WhatsApp Flow form, list orders, delay, condition (AND/OR on status, group, tag, source, assignee, custom field, session variable), HTTP request with response values saved to variables, start live chat, Conversions API, offer a booking.
- Variables: contact fields, session variables, date formatting functions. Entry by keyword. Industry templates (real estate with site visit, clinic, education). Autosave, test keyword. Per-flow stats: sent, completed, drop-off.

**AI agents**
- Types: Q&A, Sales, Support. Greeting, instructions, custom system prompt, multilingual toggle, business info, model choice and temperature.
- Knowledge base from pasted text, PDF/file upload or a website URL, then a "Train Agent" step. Actions: HTTP request, trigger workflow, text reply, add tag, update contact status/group. A playground with action logs.
- Usage consumes credits, included in the plan or bought as packages; when low, agents "may fall back to simpler responses".

**Workflows**
- Triggers: new contact, message received, tag added, event triggered, contact updated, webhook.
- Steps: delay (fixed or until a time of day), condition (yes/no), actions (send template, tag, assign chat, update contact, internal notification, webhook, start another workflow).

**Inbox**
- Filters by agent, status, tags; search by name or message text; media in and out; saved quick replies; internal notes; contact side panel.
- Bot/human handoff: "request live chat" alert, replying assigns the chat, "Resolve" returns it to the bot. Default assignment: round robin, specific user or bot.
- Tabs for Tasks (CRM to-dos with Today and Missed views), Chats, Broadcast, Orders, Events.
- Web, iOS and Android apps.

**Contacts and CRM**
- Profile with custom attributes, tags, notes, event timeline. Statuses, groups and sources configured in Settings. Dynamic segments. Bulk actions. CSV import (country code required, consent warning). Configurable dedupe key (phone, email, both). Block contact.
- Sales CRM: stages, owners, notes, tasks, pipeline views, chat linked to lead card. Hot / Warm / New buckets. Pre-sales CRM is a paid add-on.

**Broadcasts and templates**
- CSV/Excel upload with number validation, templates with text, image, video, document and buttons, send now or schedule. Metrics: sent, delivered, read, replied, failed, button/link clicks.
- Template categories Marketing, Utility, Authentication; approval minutes to 24 hours. Opt-out keywords STOP / UNSUBSCRIBE / OPT OUT with a confirmation, START to re-subscribe.
- WhatsApp Flows form builder (text, dropdown, date, radio, checkbox); submissions can save to contact, trigger a workflow or call a webhook.

**Ads and leads**
- Click-to-WhatsApp: ad click opens chat, bot qualifies, workflows nurture. Conversions API feeds replies/bookings/purchases back to Meta. Ice breakers and welcome messages for CTWA.
- Facebook Lead Ads (map fields, auto-response), Google Lead Ads, IndiaMART, 99acres, Zapier/Make/Sheets, incoming webhooks with field mapping, outgoing webhooks with custom payload and headers.

**Commerce**
- Catalog, order management, order updates, Razorpay and PayU (Starter and above). Shopify app: product sync, order status messages, abandoned-cart reminders.

**Appointments**
- Booking pages (Google Meet, video link, phone, in person), round robin, per-member working hours and time zone, optional Google Calendar. "Offer a booking" block in bots and AI agents.
- Webhooks: created, rescheduled, cancelled, completed; HMAC signature header; 10-second timeout, no retries. The docs say Wylto does not yet send WhatsApp reminders before a booking; use a workflow.

**Reports**
- Conversations (total, new, resolved, response and resolution time), agent performance, broadcast, AI (resolution, escalation, credits, top questions). Filters by date, agent, number, tag; compare; CSV/PDF export.

**Settings and billing**
- Feature toggles (CRM, chat, orders, events); member working schedules that limit assignment; session auto-resolve; per-event notification recipients; one API token per app.
- Billing: monthly/yearly, upgrade is immediate, client payment portal with invoices, self-service cancel. Trial details are not stated.
- Partner programme: 20% of payments for 2 years, white-label option.

## 3. Pricing and policies

| Plan | Price (excl. 18% GST) | Users | Notable limits |
|---|---|---|---|
| Basic | ₹1,249/mo | 1 | 2 chatbot flows, AI agents, inbox, broadcasts, analytics |
| Starter | ₹2,499/mo | 5 | Unlimited flows, scheduler, Facebook lead forms, chat assignment, e-commerce |
| Pro | ₹3,749/mo | 5 | Reminders, unlimited workflows, WhatsApp Flows, integrations, developer API |

Extra users ₹399/mo (the page also shows "$8", an inconsistency). Pre-sales CRM + Meta CAPI add-on ₹1,249/mo. About 20% annual discount. Meta fees "as per Meta", no markup.

Terms worth noting: auto-renewal; monthly plans get no refund; yearly refunds deduct a 10% cancellation fee; late fees 1.5% per month; the terms read as repurposed boilerplate (2023). Privacy policy is generic and dated 2023, with no retention periods, sub-processors, WhatsApp content handling or AI processing disclosure. No SOC 2 / ISO / GDPR statements were found.

Meta pricing context (vendor blogs, conflicting figures, check Meta's official rate card): Meta moved from conversation-based to per-delivered-template pricing in 2025-2026. Service replies inside the 24-hour window are free; Click-to-WhatsApp entry points give a 72-hour free window. Wylto's "save ~10 paise per conversation" claim looks tied to the old model.

## 4. Inferences about architecture (unverified)

Official Cloud API, REST API with one token per app, outbound webhooks (HMAC SHA-256, `X-Wylto-Signature-256`), marketing site on Cloudflare Pages. The app backend is unknown.

## 5. Wavio versus Wylto

### Wavio already has (some in a different form)
- Visual flow builder with branching on buttons, questions, conditions, tags, stage changes, HTTP call, human handoff, WhatsApp Flow node.
- Waiting until a date (offset and hour, "already passed" branch, stop on event). Wylto's docs say it lacks native booking reminders, so this is already a strength.
- Event-triggered automations, keyword and first-message triggers, abandoned-cart style cancel-on-event.
- Contacts with CSV import and consent, tags, opt-out/opt-in keywords, 24-hour window handling in the inbox.
- Leads board with Hot/Warm/New scoring, stages (resort wording), activity log, owner, value, follow-up date.
- Broadcasts with scheduling and delivery stats; template creation and submission to Meta.
- Catalog, orders, Razorpay/PayU links with a test checkout; GST invoices; plans and seat limits; team management.
- Meta lead-form webhook, CTWA ad tagging, Zoho lead push, Cal.com webhook, outgoing signed webhooks, public REST events/contacts/orders API, React SDK, installable web app.
- Resort starter pack and stay tracking (confirmation, check-in reminder, review request).

### Gaps against Wylto (parity work)
| Area | Gap |
|---|---|
| AI | No AI agent at all: knowledge base, actions, playground, credits, multilingual, handoff. Biggest gap. |
| Messages | No media in or out (image, video, audio, document, location); no list messages; templates are body-text only (no header, media, buttons). |
| Bot builder | No list/date/email/media question types or invalid-input fallback; no update-contact node, segments, "connect to flow", HTTP response extraction into variables, per-flow stats (sent/completed/drop-off), industry templates, test keyword, version history. |
| Workflows | Missing triggers: tag added, contact updated, new contact, inbound webhook; delay until time of day; internal notification action; start another workflow. |
| Inbox | No quick replies, bulk actions, status/tag filters beyond basics, round-robin assignment, "resolve returns to bot", new-message notifications, working-hours aware assignment, tasks tab. |
| Contacts | No groups, configurable statuses and sources, dynamic segments, bulk edit, dedupe setting, custom field definitions, export, block. |
| CRM | No daily task list (Today/Missed), pipeline configuration, pre-sales fields. |
| Broadcasts | No CSV validation, media templates, button/link click tracking, "replied" metric. |
| Reports | Only a stats strip: no response time, agent performance, flow, AI or campaign reports, no export. |
| Bookings | No booking pages, Google Calendar availability, round robin, "offer a booking" node (only a Cal.com webhook). |
| Integrations | No Shopify app, Google Lead Ads, IndiaMART/99acres, Zapier/Make, incoming webhooks with field mapping, Conversions API feedback to Meta, two-way Zoho sync. |
| Onboarding | No Embedded Signup; credentials are pasted in by hand. No number migration help, no multi-number or multi-app support. |
| Platform | No native iOS/Android apps; no reseller/white-label programme; single-server SQLite. |

### Where Wylto looks weak (how Wavio can be better)
1. **API openness.** Wylto's integrations page says to contact support for API endpoints and credentials. Wavio can ship public OpenAPI docs, scoped keys, sandbox mode and SDKs on every plan.
2. **Webhook reliability.** Wylto's documented booking webhooks have a 10-second timeout and no retries. Wavio can retry with backoff, show a delivery log and allow replay.
3. **Date-based reminders.** Wylto says it has no native pre-booking reminders. Wavio already has them; make it a headline feature with a visual timeline.
4. **Onboarding speed.** Wylto's own docs say 24-48 hours while the homepage says minutes. Embedded Signup would make Wavio genuinely fast.
5. **Trust and compliance.** Wylto's terms and privacy pages are generic, dated 2023, and silent on retention, sub-processors, AI processing and certifications. Wavio can publish a real privacy policy, retention and deletion controls, encrypted credentials, an audit log and a DPA.
6. **Fair billing.** Wylto's refund terms are strict (no partial refunds, 10% fee on yearly) and the trial is unspecified. Wavio can offer a clear 14-day trial, prorated changes and plain cancellation.
7. **Plan gating.** Wylto locks assignment behind Starter, WhatsApp Flows and the API behind Pro. Wavio can keep core collaboration and the API in every tier.
8. **Measurement.** Wylto reports activity, not money. Wavio can attribute revenue: ad or campaign to lead to booking or payment, per message cost under Meta's per-message pricing, and warn before Meta tier limits.
9. **Builder quality.** Wylto does not document a simulator or version history. Wavio can add an in-editor simulator, publish/rollback and a run log per contact.
10. **Vertical depth.** Wylto's resort/hotel content is thin. Wavio can go deep on hospitality: pre-arrival checklists, upsells, advance payment, group bookings, review routing, seasonal offers.

## 6. Roadmap to match and then beat Wylto

**Phase A: make it pilot-safe (1-2 weeks)**
Real WhatsApp end-to-end test; media send/receive in inbox; new-message notifications; real secrets, login rate limits, password reset; encrypted tokens; Postgres or Cloudflare migration and backups; automated tests for the core flows.

**Phase B: parity (4-6 weeks)**
1. AI agent: knowledge base from text/PDF/URL, Q&A/Sales/Support modes, actions, playground, usage credits, handoff to human, language detection.
2. Rich messages: list messages, media, location, URL buttons, templates with header/media/buttons.
3. Builder v2: new question types and validation fallback, update-contact, segments, connect-to-flow, HTTP extraction to variables, per-flow stats, industry templates, test mode.
4. Workflows v2: tag-added, contact-updated, new-contact and inbound-webhook triggers; delay until time of day; internal notifications; start another workflow.
5. Inbox and contacts v2: quick replies, bulk actions, round-robin, resolve-to-bot, groups/statuses/sources, dynamic segments, custom fields, dedupe, export, tasks tab.
6. Reports: conversations, agent performance, broadcast, flow, AI; filters, compare, CSV/PDF.
7. Booking pages with Google Calendar and an "offer a booking" node.
8. Integrations: Shopify app, Zapier/Make, incoming webhooks with field mapping, Conversions API, Google Lead Ads, two-way Zoho.

**Phase C: beat them (ongoing)**
Embedded Signup and instant onboarding; public OpenAPI + webhook retries and replay; revenue attribution and per-message cost tracking; builder simulator and versioning; published privacy, retention and audit log; deep hospitality kit; multi-number and multi-workspace; native mobile apps; reseller programme.

## 7. Open questions this research could not answer
- Which AI model Wylto uses and how credits are priced.
- Their real API endpoints, auth and rate limits (not public).
- Whether Wylto uses Embedded Signup or a managed migration for every customer.
- Real customer experience: reliability, support quality, template approval delays. A trial account, screenshots or a call with a Wylto customer would answer these.
- Meta's current official per-message rate card for India (sources conflict).
