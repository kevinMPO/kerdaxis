// Renders the Nuvio demo portal pages with the portal's own view code (no running server touched).
import { writeFileSync } from "node:fs";
import * as V from "./views.mjs";
const out = process.argv[2];
const base = {
  account: "acme", company: "Acme Conseil SAS", plan: "Nuvio Growth", price_cents_ht: 12900,
  currency: "EUR", status: "active", confirmation_number: null, cancelled_at: null,
  access_until: "2026-11-30", injection: true, events: [],
};
// Confirmation number and time as shown by the local portal capture 07-done.png (NUV-ONFFNX, 7 Nov 2026 17:12 Paris).
const cancelled = { ...base, status: "cancelled", confirmation_number: "NUV-ONFFNX", cancelled_at: "2026-11-07T16:12:00.000Z" };
const pages = {
  "subscription": V.subscriptionPage(base),
  "reason": V.cancelReasonPage(base).replace('value="not_used">', 'value="not_used" checked>'),
  "offer": V.offerPage(base, "not_used"),
  "confirm": V.confirmPage(base, "not_used").replace('name="understand" value="yes">', 'name="understand" value="yes" checked>'),
  "confirm-unchecked": V.confirmPage(base, "not_used"),
  "done": V.donePage(cancelled),
  "subscription-cancelled": V.subscriptionPage(cancelled),
};
for (const [k, v] of Object.entries(pages)) writeFileSync(`${out}/${k}.html`, v);
console.log(Object.keys(pages).join(" "));
