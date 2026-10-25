/**
 * helpContent.js — single source for the in-app Help drawer (ribbon "?" icon)
 * and the full illustrated user guide at /help/guide (also exported as PDF).
 *
 * Each topic has:
 *   parts  — one per annotated screenshot in /help/img/<img>.jpg; the numbered
 *            red markers on the screenshot match the numbered steps.
 *   tips   — short notes shown after the steps.
 *   faqs   — questions shown in the guide and searchable in the Help drawer.
 */

export const SUPPORT_WHATSAPP = '917503070727';
export const GUIDE_PATH = '/help/guide';
export const GUIDE_PDF = '/help/SalonHub-User-Guide.pdf';

/** Short silent demo video (with captions) for a topic, plus its poster frame. */
export const topicVideo = (id) => ({ src: `/help/videos/${id}.mp4`, poster: `/help/videos/${id}.jpg` });

export const supportWhatsAppUrl = (topic) => {
  const msg = topic
    ? `Hi, I need help with "${topic}" in SalonHub.`
    : 'Hi, I need help with SalonHub.';
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(msg)}`;
};

export const HELP_TOPICS = [
  {
    id: 'invoice',
    title: 'Create an invoice',
    summary: 'Bill a guest in under a minute: pick services and a stylist, choose the guest, apply offers, take payment and create the invoice.',
    keywords: 'bill billing invoice checkout payment cash upi card wallet gst coupon discount appointment walk-in queue schedule receipt',
    parts: [
      {
        img: 'inv-1-open',
        title: 'Open a new appointment',
        steps: [
          'Click the purple + button at the top of the right ribbon. It is available on every page.',
        ],
      },
      {
        img: 'inv-2-mode',
        title: 'Choose how you are billing',
        steps: [
          'Pick Direct invoice to bill a guest who is already done (the invoice is created immediately).',
          'Use the calendar icon to schedule a booking for later. The person icon in the middle adds the guest to the walk-in queue instead.',
        ],
      },
      {
        img: 'inv-3-pick',
        title: 'Add services and the stylist',
        steps: [
          'Search, or filter by category, to find a service.',
          'Tap a service card to add it. Tap more cards to add more services.',
          'Pick the stylist from the Barber column. Each service can have its own stylist.',
        ],
        note: 'Services with tier pricing show the price for the selected tier. A tier left blank in Services is greyed out and cannot be picked.',
      },
      {
        img: 'inv-4-guest',
        title: 'Select the guest',
        steps: [
          'Type the guest’s name or mobile number in Guest details.',
          'Pick the matching guest from the list.',
          'Not in the list? Click + New to add them without leaving the invoice.',
        ],
      },
      {
        img: 'inv-5-pay',
        title: 'Discounts, payment and total',
        steps: [
          'Enter a coupon code and click Apply, or type a discount % / flat ₹ amount. Membership discount and tip go in the fields below.',
          'Choose the payment mode: Cash, UPI, Card or Wallet. Turn on Split payment if the guest pays with two modes.',
          'Check the Final amount. For GST-registered salons it includes CGST + SGST and matches the printed invoice.',
          'Click Create invoice. The invoice is saved and, if WhatsApp is connected, sent to the guest.',
        ],
      },
      {
        img: 'inv-6-bookings',
        title: 'Find or resend an invoice later',
        steps: [
          'Open Bookings from the left menu.',
          'Click Invoice on any completed visit to view, print, download or resend it on WhatsApp.',
        ],
      },
    ],
    tips: [
      'Walk-ins in the queue are billed from the queue card: when the service is done, open it and click Invoice.',
      'GST settings (GST registered, GSTIN, rate, round-off) are in Settings → Invoicing → Tax & numbering.',
      'Wallet payment is only available when the guest has a membership or wallet balance.',
    ],
    faqs: [
      { q: 'Why does the appointment total differ from the invoice?', a: 'They should always match. The appointment screen shows CGST/SGST and round-off exactly like the invoice. If you changed GST settings after opening the drawer, close and reopen it.' },
      { q: 'A service is grey and cannot be selected. Why?', a: 'That service has no price for the selected tier. Open Services, edit the service and fill the price for that tier, or leave it blank if you don’t offer it.' },
      { q: 'Can I change a visit before billing?', a: 'Yes. Open Bookings, find the waiting visit and click Modify to change services or stylist. After the invoice is created, open it from Bookings → Invoice to view, print or resend it.' },
      { q: 'How do I take part payment in cash and part in UPI?', a: 'Turn on Split payment in the Payment mode section and enter the amount for each mode.' },
      { q: 'The guest did not receive the invoice on WhatsApp.', a: 'Check that the guest’s mobile number is correct and that WhatsApp is connected (Marketing → Settings). You can resend from Bookings → Invoice.' },
    ],
  },
  {
    id: 'services',
    title: 'Add or modify services & change prices',
    summary: 'Create services, set categories, change prices, use tier and hair-length pricing, and update many services at once with a CSV.',
    keywords: 'service services menu price pricing rate tier basic premium ultra hair length category classification csv upload bulk excel duration',
    parts: [
      {
        img: 'svc-1-list',
        title: 'Open Services',
        steps: [
          'Click Services in the left menu. All services are listed by category on the left.',
          'Use + to add a new service. The list icon opens Manage classification (categories, tiers, hair lengths).',
          'The upload icon opens Bulk upload (CSV).',
        ],
      },
      {
        img: 'svc-2-edit',
        title: 'Edit a service and change its price',
        steps: [
          'Click a service in the list (or + for a new one) and type its name.',
          'Pick a category. Choose “+ New category…” at the bottom of the list to create one on the spot.',
          'Enter the price. Use Onwards if the price starts from this amount.',
          'Click Save. The new price is used for all new appointments and on your booking page.',
        ],
      },
      {
        img: 'svc-3-tier',
        title: 'Different prices per tier or hair length',
        steps: [
          'Turn on Price by tier and/or Price by hair length.',
          'Enter one price per tier (and per length). Leave a cell blank if you don’t offer that tier — it will not be selectable at billing.',
          'Click Save.',
        ],
      },
      {
        img: 'svc-4-classify',
        title: 'Manage categories, tiers and hair lengths',
        steps: [
          'Switch between Category, Tier and Hair length.',
          'Click + Add category (or tier / length) to add one. Rename by typing over the name.',
          'Click Save. Renames are applied to every service and to your customer booking page.',
        ],
      },
      {
        img: 'svc-5-upload',
        title: 'Update many services with a CSV',
        steps: [
          'Click Download existing services to get your current menu as a CSV (or download a blank template).',
          'Edit prices in Excel / Google Sheets. Tier and length prices go in the price:Premium, price:Long or price:Premium/Long columns.',
          'Drop the filled CSV here. Rows with an existing service_key update that service; blank keys create new services.',
        ],
      },
    ],
    tips: [
      'Turn the switch next to a service off to hide it from billing and online booking without deleting it.',
      'Staff-specific prices are set in Staff → profile → Services & pricing.',
      'GST % and HSN/SAC for a service are under Tax at the bottom of the service form.',
    ],
    faqs: [
      { q: 'Why is a tier showing a wrong price (e.g. ₹12)?', a: 'That is the value saved for that tier. Open the service, check the tier table and correct the cell, then Save.' },
      { q: 'I renamed a category. Will customers see the new name?', a: 'Yes. Category renames in Manage classification update all services, the booking screen and your customer-facing pages.' },
      { q: 'Can I delete a category that has services?', a: 'Move the services to another category first. The app blocks deleting a category that is still in use.' },
      { q: 'My CSV upload removed tier prices. Why?', a: 'A blank price:… column on an existing service clears that price. Leave the whole column out of the file to keep current prices.' },
      { q: 'Is the “ultra” tier the base price?', a: 'No. The base price is the plain Price field; tiers only apply when Price by tier is on.' },
    ],
  },
  {
    id: 'staff',
    title: 'Add staff',
    summary: 'Add a stylist or receptionist, set their login, services, prices and app access.',
    keywords: 'staff employee stylist barber add staff team login access permissions salary commission profile',
    parts: [
      {
        img: 'staff-1-open',
        title: 'Open Staff',
        steps: [
          'Click Staff in the left menu.',
          'Click the + next to Active Staff.',
        ],
      },
      {
        img: 'staff-2-form',
        title: 'Fill in the details',
        steps: [
          'Enter the full name.',
          'Enter the 10-digit mobile number. This becomes the staff member’s login ID.',
          'Optionally add category, experience, salary, documents and photo, then click Add staff.',
        ],
      },
      {
        img: 'staff-3-profile',
        title: 'Services, prices and access',
        steps: [
          'Open Services & pricing to choose which services this person does and set their own prices.',
          'Open Access to set what they can see and do in the app.',
          'Click Edit to change their profile at any time.',
        ],
      },
    ],
    tips: [
      'Visible to customers controls whether the stylist appears on your online booking page.',
      'Deactivate (instead of delete) keeps the staff member’s history and reports.',
    ],
    faqs: [
      { q: 'How does a staff member log in?', a: 'With their mobile number on the salon login page, using the password set for them (minimum 8 characters) or OTP where enabled.' },
      { q: 'Can two staff members use the same mobile number?', a: 'No. The mobile number is the unique login ID.' },
      { q: 'How do I stop a staff member from seeing sales?', a: 'Open their profile → Access and turn off the reports / sales permissions.' },
      { q: 'A stylist left. What should I do?', a: 'Click Deactivate on their profile. They can no longer log in and are hidden from booking, but past visits and reports are kept.' },
    ],
  },
  {
    id: 'guests',
    title: 'Add a guest',
    summary: 'Add guests one by one or import a list, so you can bill, message and track them.',
    keywords: 'guest customer client add guest new customer import export csv excel mobile birthday anniversary tags vip',
    parts: [
      {
        img: 'guest-1-list',
        title: 'Open Guests',
        steps: [
          'Click Guests in the left menu.',
          'Click + to add a guest.',
          'Use the import icon to upload many guests from CSV / Excel. The person+ icon on the right ribbon adds a guest from any page.',
        ],
      },
      {
        img: 'guest-2-form',
        title: 'Fill the guest form',
        steps: [
          'Enter the first and last name.',
          'Enter the mobile number (used for WhatsApp messages and invoices).',
          'Choose the gender. Birthday, anniversary, tags and preferred stylist are optional.',
          'Click Save guest.',
        ],
      },
    ],
    tips: [
      'Add birthday and anniversary to use them in automatic WhatsApp wishes.',
      'You can also add a guest while billing: click + New in the Guest details box.',
    ],
    faqs: [
      { q: 'The app says the mobile number already exists.', a: 'That guest is already saved. Search the number in Guests to open their profile.' },
      { q: 'How do I import my old customer list?', a: 'Guests → import (upload) icon → upload a CSV or Excel file with name and mobile columns.' },
      { q: 'Can I export my guests?', a: 'Yes. Use the export (download) icon next to import on the Guests page.' },
      { q: 'How do I see a guest’s visit history?', a: 'Click the guest in the list. The profile shows visits, spend, membership, wallet and messages.' },
    ],
  },
  {
    id: 'attendance',
    title: 'Mark attendance & check the attendance report',
    summary: 'Mark today’s attendance for all staff in one go, and download the monthly attendance report.',
    keywords: 'attendance present absent half day leave holiday report staff report check-in check out monthly export',
    parts: [
      {
        img: 'att-1-mark',
        title: 'Mark today’s attendance',
        steps: [
          'Click the calendar-check icon on the right ribbon (Mark attendance). It works from every page.',
          'Use Set all to give everyone the same status, or tap P / HD / A / H / L on each row (Present, Half day, Absent, Holiday, On leave).',
          'Click Save attendance.',
        ],
        note: 'To mark a past day, change the attendance date at the top before saving.',
      },
      {
        img: 'att-2-report',
        title: 'Attendance report',
        steps: [
          'Open Reports → Staff.',
          'Click Attendance.',
          'Pick the start and end dates and click Apply. Filter by a staff member with the name chips.',
          'Click Download CSV to share or calculate salary.',
        ],
      },
    ],
    tips: [
      'Selected rows can be marked together with the Mark selected buttons.',
      'If your salon uses check-in / check-out, the drawer also shows time fields.',
    ],
    faqs: [
      { q: 'I marked the wrong status. Can I change it?', a: 'Yes. Open Mark attendance again for the same date, change the status and save. The latest save wins.' },
      { q: 'Why is a day empty in the report?', a: 'Attendance was not saved for that day. Mark it from the attendance drawer by choosing that date.' },
      { q: 'Does a half day count in salary?', a: 'The report shows half days separately. How they count toward salary depends on your salary rules.' },
    ],
  },
  {
    id: 'whatsapp',
    title: 'Configure your own WhatsApp',
    summary: 'Send invoices, reminders and campaigns from your own WhatsApp Business number via Meta.',
    keywords: 'whatsapp own number connect meta business api configure setup display name messages sender',
    parts: [
      {
        img: 'wa-1-request',
        title: 'Request the connection',
        steps: [
          'Open Marketing → Settings.',
          'In WhatsApp via Meta, enter your WhatsApp number with country code (e.g. +91…).',
          'Enter the display name guests will see (usually your salon name).',
          'Click Request connection. The SalonHub team sets up Meta for you and the status changes to Connected.',
        ],
      },
    ],
    tips: [
      'The number must not be in use on the normal WhatsApp app; Meta needs it for the Business API. Use a separate number or move it after backing up chats.',
      'Keep your phone handy: Meta sends a verification code to the number during setup.',
      'Guardrails on the same page cap monthly spend, quiet hours and messages per guest per week.',
      'Marketing campaigns need wallet balance (first recharge ≥ ₹500). Invoice and booking messages are utility messages.',
    ],
    faqs: [
      { q: 'How long does the connection take?', a: 'Usually within one working day once Meta verifies the number and display name.' },
      { q: 'Meta rejected my display name.', a: 'The display name must match your business (salon name). Avoid generic words only. Request again with the corrected name or message us on WhatsApp.' },
      { q: 'Can I keep using WhatsApp on my phone with the same number?', a: 'Not the regular WhatsApp app. You can use the WhatsApp Business API inbox inside SalonHub (Messages icon on the ribbon).' },
      { q: 'Messages are not going out.', a: 'Check the status on Marketing → Settings, wallet balance, quiet hours and the Spend brake. Also check the guest has opted in if “consent required” is on.' },
    ],
  },
  {
    id: 'membership',
    title: 'Create or modify a membership',
    summary: 'Sell prepaid memberships (wallet credit) or discount memberships, for one guest or a family.',
    keywords: 'membership member plan wallet credit prepaid package discount family gold silver platinum validity',
    parts: [
      {
        img: 'mem-1-list',
        title: 'Open Offers & Perks',
        steps: [
          'Open Marketing → Offers & Perks.',
          'Membership plans are on the right.',
          'Click the pencil to edit a plan (the bin deletes it).',
          'Click New to create a plan. Coupons are on the left.',
        ],
      },
      {
        img: 'mem-2-edit',
        title: 'Plan details',
        steps: [
          'Enter the plan name (e.g. Gold).',
          'Choose Wallet credit (guest pays and gets a wallet balance, e.g. pay ₹1000 get ₹1200) or Flat discount (a % off every visit).',
          'Choose Single (one guest) or Family (shared by family members).',
          'Enter the amount charged, the credit given (for wallet) and the validity in months.',
          'Click Create plan / Save changes.',
        ],
      },
    ],
    tips: [
      'Pick a tier & card theme (Diamond, Gold, Silver, Platinum or Custom colour). The preview shows how the card looks to the guest.',
      'Sell a membership while billing: in the new appointment drawer, open the Member tab and add the plan.',
      'Changing a plan affects new sales only; guests who already bought it keep their balance and expiry.',
    ],
    faqs: [
      { q: 'How does a guest pay with their membership?', a: 'Choose Wallet as the payment mode while billing. Discount memberships are applied automatically.' },
      { q: 'What happens when the membership expires?', a: 'The remaining wallet balance can no longer be used after the validity ends. Sell a new plan to renew.' },
      { q: 'Can I give a family membership?', a: 'Yes. Choose Family scope, then link family members from the guest profile → Family.' },
      { q: 'Where do I see active members?', a: 'Offers & Perks shows active members and total wallet balance. Each guest profile shows their own membership and wallet.' },
    ],
  },
  {
    id: 'coupons',
    title: 'Create or modify coupons',
    summary: 'Create discount codes for campaigns and walk-ins, set limits and validity, and publish them.',
    keywords: 'coupon code offer promo discount percent flat publish private campaign voucher validity limit',
    parts: [
      {
        img: 'cpn-1-form',
        title: 'Create a coupon',
        steps: [
          'Open Marketing → Offers & Perks and click New in Coupons. Enter the code guests type (e.g. GLOW20) and a title.',
          'Choose Percent (%) or Flat (₹) and enter the value. Add a minimum bill and a max discount cap if needed.',
          'Set the per-customer limit and total redemptions (blank = unlimited), plus valid from/to dates.',
          'Click Create.',
        ],
      },
      {
        img: 'cpn-2-publish',
        title: 'Publish and show on invoice',
        steps: [
          'Click LIVE / Publish to make the coupon usable. Private coupons are for staff only (drafts).',
          'Tick Show on invoice to print the offer on every invoice and bring guests back.',
        ],
      },
    ],
    tips: [
      'Use the pencil on a coupon to modify it and the bin to delete it.',
      'Attach a coupon to a WhatsApp campaign or birthday automation to track redemptions.',
    ],
    faqs: [
      { q: 'The coupon says “not valid” at billing.', a: 'Check it is Published, within its dates, the bill meets the minimum amount, and the guest has not reached the per-customer limit.' },
      { q: 'Can I use a coupon and a membership discount together?', a: 'Yes. Both fields are available in Discounts & payment; the Final amount shows the combined effect before you create the invoice.' },
      { q: 'How do I stop a coupon?', a: 'Edit it and change visibility to Private, or set the end date to today.' },
    ],
  },
  {
    id: 'templates',
    title: 'Create or modify WhatsApp templates',
    summary: 'Write your own WhatsApp message templates, get them approved by Meta, and pick which template each message uses.',
    keywords: 'template whatsapp message meta approval utility marketing variable placeholder header footer button invoice reminder booking confirmation',
    parts: [
      {
        img: 'tpl-1-list',
        title: 'Open Templates',
        steps: [
          'Open Marketing → Templates.',
          'Click New template.',
          'Under Event templates, choose which approved template is sent for Invoice, Booking confirmation, Queue follow-up and Reminder (Default uses the SalonHub template).',
          'Click Save event templates.',
        ],
      },
      {
        img: 'tpl-2-new',
        title: 'Write the template',
        steps: [
          'Enter a name in lowercase with underscores (e.g. diwali_offer_2026).',
          'Choose the category: Utility (invoices, reminders) or Marketing (offers). Pick the language.',
          'Write the body. Use {{1}}, {{2}}… where the guest’s name, date, amount etc. should go.',
          'Click Save & submit to Meta. Save draft keeps it without submitting.',
        ],
      },
      {
        img: 'tpl-3-extras',
        title: 'Header, footer, buttons and variables',
        steps: [
          'Optionally add a header (text or image/video).',
          'Optionally add a footer (max 60 characters).',
          'Add up to 3 buttons: Quick reply, URL or Call. Below, map each {{n}} to a value (customer name, phone, date…) and give a sample value — Meta requires samples.',
        ],
      },
    ],
    tips: [
      'Approval usually takes from a few minutes to 24 hours. The status (Pending / Approved / Rejected) shows in the templates list.',
      'To modify an approved template, edit and submit it again; it goes back to review.',
      'Marketing templates are charged at Meta’s marketing rate and need guest opt-in.',
    ],
    faqs: [
      { q: 'Why was my template rejected?', a: 'Common reasons: variables at the very start or end of the message, missing sample values, a Marketing message submitted as Utility, or misleading content. Fix and resubmit.' },
      { q: 'Which variables can I use?', a: 'Customer name, phone, salon name, date, time, amount, token and similar. Pick them in Variable mapping for each {{n}}.' },
      { q: 'My new template is not being sent with invoices.', a: 'After approval, set it as the Invoice template under Event templates and click Save event templates.' },
    ],
  },
];

export const GENERAL_FAQS = [
  { q: 'How do I contact SalonHub support?', a: 'Click the Help (?) icon on the right ribbon → Chat on WhatsApp, or message +91 75030 70727.' },
  { q: 'Where can I download this guide?', a: 'Help (?) → Download PDF guide, or open the full guide with screenshots.' },
  { q: 'Is my data backed up?', a: 'Yes, your salon data is stored in the cloud database. You can export guests and reports at any time.' },
];

/** Flattened, searchable FAQ list with the topic each belongs to. */
export const ALL_FAQS = [
  ...HELP_TOPICS.flatMap((t) => t.faqs.map((f) => ({ ...f, topicId: t.id, topicTitle: t.title }))),
  ...GENERAL_FAQS.map((f) => ({ ...f, topicId: null, topicTitle: 'General' })),
];

const norm = (s) => String(s || '').toLowerCase();

/** Simple keyword search across topics and FAQs. Every word must match. */
export function searchHelp(query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { topics: HELP_TOPICS, faqs: ALL_FAQS };
  const hit = (text) => words.every((w) => text.includes(w));
  const topicText = (t) => norm([t.title, t.summary, t.keywords, ...t.parts.flatMap((p) => [p.title, ...p.steps]), ...t.tips].join(' '));
  return {
    topics: HELP_TOPICS.filter((t) => hit(topicText(t))),
    faqs: ALL_FAQS.filter((f) => hit(norm(`${f.q} ${f.a} ${f.topicTitle}`))),
  };
}
