# Marketing Studio — one-time setup

Marketing now has **Calendar**, **Studio** (posters + 1-tap share), photo
campaigns and Instagram. Most of it works with no setup. Two parts need
one-time work by the platform owner in Meta's dashboards.

| Feature | Works without setup? |
|---|---|
| Studio posters, Share / WhatsApp / Instagram share sheet, Download | Yes |
| Calendar (built-in occasions, own events, birthdays) | Yes |
| Festival dates (Diwali, Holi, Eid …) | After you confirm them: Platform → **Festival calendar** |
| WhatsApp photo campaigns | Needs WhatsApp connected (below); the salon then taps **Set up photo sending** once |
| Instagram connect / post / schedule | Needs the Instagram app (below) and Meta app review |

---

## 1. Festival calendar (5 minutes, once a year)

Platform login → **Festival calendar** → **Add festival list**. Lunar festival
dates are estimates: check each date against your local calendar, fix it if
needed and click **Confirm & publish**. Salons only see published festivals.

## 2. Connect a salon's own WhatsApp number

Only you can do this in Meta (it needs your login, phone OTP and business
verification). About 20 minutes:

1. **developers.facebook.com → My Apps → Create app** → type **Business** →
   add the **WhatsApp** product.
2. **business.facebook.com → Settings → Users → System users → Add** (Admin).
   **Assign assets**: your app and the WhatsApp account (full control).
   **Generate token** for the app with `whatsapp_business_messaging` and
   `whatsapp_business_management` — choose **Never expire**. Copy it.
3. **WhatsApp Manager → Phone numbers → Add phone number**: the salon's number
   (it must not be in use on the normal WhatsApp app), verify it by OTP, set
   the display name (Meta approves it).
4. Copy the **WhatsApp Business Account ID** and **Phone number ID**.
5. SalonHub **Platform → WhatsApp requests** → open the salon's request →
   paste WABA ID, Phone number ID, token → save. The salon's Marketing →
   Settings shows **Connected**.

Photo campaigns then work after the salon taps **Set up photo sending (one
time)** in a campaign; WhatsApp approves the photo template in minutes to a
few hours.

## 3. Instagram (Instagram API with Instagram Login)

1. In the same Meta app: **Add product → Instagram → API setup with Instagram
   login**.
2. **Business login settings → OAuth redirect URI**:
   `https://salonhub.in/api/instagram/callback` (use your real domain).
3. Copy the **Instagram app ID** and **Instagram app secret** into the backend
   environment and restart:

   ```
   INSTAGRAM_APP_ID=...
   INSTAGRAM_APP_SECRET=...
   # optional, defaults to {BACKEND_PUBLIC_URL}/api/instagram/callback
   INSTAGRAM_REDIRECT_URI=https://salonhub.in/api/instagram/callback
   ```

   On Emergent, add these in the Emergent app's environment variables.
4. **App review**: request **Advanced access** for
   `instagram_business_basic` and `instagram_business_content_publish`
   (Meta asks for a screen recording of connecting and posting — use a test
   salon). Until approved, only Instagram accounts added as **testers** of the
   app can connect.
5. Salons connect in **Marketing → Media → Connect Instagram** (needs an
   Instagram **professional** account: Business or Creator). Their latest posts
   then show on their public salon page, and Studio can post or schedule
   posters to the feed or story.

`BACKEND_PUBLIC_URL` must be the public HTTPS address of the backend:
WhatsApp and Instagram download poster images from
`{BACKEND_PUBLIC_URL}/api/public/marketing-media/...`.
