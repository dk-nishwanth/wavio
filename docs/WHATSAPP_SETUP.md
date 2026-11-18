# Connecting WhatsApp

Status when this was written: the number 9636085370 is already in the *Jawai Retreat* business portfolio as a WhatsApp account (display name "Jawai Retreat", quality High, 250 customers/24h), with no provider attached. There is **no developer app** yet.

## Decision first
If staff reply to guests on that number in the **WhatsApp Business app**, connecting it to Wavio's API will normally stop it working in that app. Meta's "coexistence" (both at once) is only available through an approved provider, not a self-built tool.

| Option | What it means |
|---|---|
| **A. A second number for the bot** (recommended to start) | A spare SIM, registered as a new WhatsApp account in the same business. Staff keep the current number untouched. |
| **B. Move the current number to Wavio** | Everything for that number happens in Wavio's Inbox. The phone app stops working on it. |

## Steps
1. Sign in at `business.facebook.com` → Business settings. Confirm the *Jawai Retreat* portfolio, its Page and Instagram.
2. Create a developer app (`developers.facebook.com` → My Apps → Create App). This needs a Facebook profile that has full access to the portfolio (Hardik Agarwal's, as of now). Choose the WhatsApp / "connect with customers" use case and link the app to *Jawai Retreat*.
3. In the app: **WhatsApp → API Setup**. Add the number (option A) or select the existing WhatsApp account (option B). Enter the code Meta sends to that SIM. Note the **Phone number ID** and **WhatsApp Business Account ID**.
4. Business settings → **System users** → add one (Admin) → assign it the app and the WhatsApp account (full control) → **Generate token** with `whatsapp_business_management` and `whatsapp_business_messaging`. Copy it once; it never expires.
5. App → **Settings → Basic**: copy the **App secret**.
6. In Wavio: **Settings → WhatsApp Cloud API**: paste Phone number ID, WABA ID, token and app secret → **Save** → **Check connection** → **Send test** to your own phone.
7. Webhook: in the Meta app → WhatsApp → Configuration, paste the **Callback URL** and **Verify token** shown in Wavio's Settings, and subscribe to **messages**. (Needs the public https address from the hosting step.)
8. Message in from your phone: the Hotel Bot should answer. Then *Templates → Sync status* once Meta approves your templates.

Never paste the token, app secret or verification codes into chat tools or email. Paste them directly into Wavio's Settings.
