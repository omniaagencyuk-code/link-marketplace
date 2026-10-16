# Stripe: setting it up, and checking it is real

Press Parrot takes payment through **Stripe Checkout** — Stripe's own hosted
page, not a form on our site. There is no publishable key and no Stripe.js
anywhere in the codebase; the customer is redirected, pays on
`checkout.stripe.com`, and comes back.

Two server-side secrets make the whole thing work:

| Variable | Where it comes from |
|---|---|
| `STRIPE_SECRET_KEY` | the account's API keys page, **live mode** |
| `STRIPE_WEBHOOK_SECRET` | the webhook destination, once it exists |

Both live in Vercel's **production** environment and nowhere else. With neither
set the site runs exactly as before with checkout switched off — the basket says
payments are unavailable rather than breaking.

**`/admin/diagnostics` answers "can we take payments?" without anybody having to
remember this document.** It asks Stripe rather than reading the configuration,
for reasons set out at the end.

---

## What the code already does

- `src/app/dashboard/orders/actions.ts` re-prices the basket on the server,
  writes the order **before** redirecting, then creates the Checkout session.
  A basket claiming a $500 placement costs $5 produces a $500 order.
- `src/app/api/stripe/webhook/route.ts` is the **only** thing that marks an
  order paid. The customer returning to the success page is not proof of
  anything: they can close the tab, lose signal, or type that URL themselves.
- Sessions carry `automatic_tax: { enabled: true }`, so **Stripe** works out
  VAT from the billing address and any VAT number the buyer enters. Nothing in
  this codebase calculates tax.
- Prices are **net**: `tax_behavior: 'exclusive'`, so VAT goes on top of the
  figure the publisher and the customer both saw.

---

## 1. The account

Activate payments in Stripe: company details, bank account, ID. Live keys exist
only after that.

Check the environment switcher at the top of the sidebar says your account with
**no Sandbox badge**. A sandbox is a complete, convincing, fake Stripe — its API
keys page is identical to the live one, and its keys begin `sk_test_` exactly
like classic test mode. Everything below can be done perfectly in the wrong
environment and the only visible difference is `cs_test_` in a checkout URL.

## 2. Stripe Tax — do this before anything else

[Settings → Tax](https://dashboard.stripe.com/settings/tax):

- **Head office** — the origin address.
- **Registrations** — at least one. Stripe charges tax only where you are
  registered: with a UK registration a UK customer pays 20% and a US customer
  pays nothing, whatever currency you sell in.

Skip this and checkout does not open at all. Every session asks Stripe to work
out the tax, and Stripe refuses the request without an origin address. The
customer sees *"We could not open checkout just now. Nothing has been
charged."* and nothing anywhere says the word tax.

## 3. The secret key

[Developers → API keys](https://dashboard.stripe.com/apikeys), live mode.

Reveal the standard secret key, or **+ Create secret key** → *Powering an
integration you built* (not the AI-agent option, which attaches approval rules
that would sit between checkout and the payment). Stripe shows a new key once,
at creation.

Paste into `STRIPE_SECRET_KEY` on Vercel's production environment. **It must
begin `sk_live_`.** Nothing in a sandbox or in test mode does.

## 4. The webhook

[Developers → Webhooks](https://dashboard.stripe.com/webhooks) → **Add
destination**, in live mode:

- **Events** — exactly two: `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`. They are the only two the route
  acts on; everything else it acknowledges and ignores.
- **Payload style** — *snapshot* (sometimes "standard"), not *thin*. The
  handler reads the whole session out of `event.data.object`; a thin event
  carries an id and `session.payment_status` would be undefined, so every
  payment would be silently ignored.
- **Destination type** — Webhook endpoint.
- **URL** — `https://pressparrot.com/api/stripe/webhook`
- **API version** — `2026-08-26.dahlia`, matching the pin in
  `src/lib/stripe/client.ts`.

Copy the `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

## 5. Redeploy

Environment variables reach a deployment when it is built, not while it runs.
Nothing above takes effect until production is redeployed.

## 6. Prove it with real money

Buy the cheapest listing with a real card, then refund it.

1. **Before typing a card number, look at the URL.** `cs_live_` and you are
   live; `cs_test_` and the key is still a test one.
2. The charge appears in live **Payments**, with VAT as its own line if you
   bought as a UK customer.
3. The webhook destination's delivery count goes 0 → 1 with a **200**.
4. The order flips to paid in `/admin/orders`, showing what Stripe actually
   took.

A **400** on the delivery means the stored secret is not that endpoint's — fix
it and use **Resend** on the failed delivery rather than paying again; the
handler is idempotent and built for exactly that. A **500** means the handler
threw, and Stripe will retry on its own.

Refunding does not change the order: nothing listens for refund events. Cancel
it in the admin too if you want the record tidy.

---

## Things that bite

**Promo codes are mode-specific.** Each code stores a Stripe coupon id, and a
coupon created under a test key does not exist in live mode. Codes made before
the switch fail at checkout; recreate them.

**Payouts are gross of VAT.** A $94.80 payment paying out £67.86 includes the
VAT Stripe collected on HMRC's behalf. Stripe calculates and reports it;
filing and paying it is not automatic.

**Selling in USD from a UK account** converts on every payout, with Stripe's
conversion fee on top of the card fee. Adding a USD bank account to the Stripe
account lets you hold dollars instead.

**Currency comes from `/admin/settings`**, not from Stripe. Prices are stored as
minor units with no currency attached, so a listing at `20000` is $200 or £200
purely on the strength of that dropdown.

---

## Why `/admin/diagnostics` asks Stripe rather than reading the config

Because on the afternoon this went live, every configuration answer was yes
while the site took nothing but sandbox payments. The keys were set. The
webhook existed. Checkout opened, accepted a card, charged VAT, and returned
to the success page. All of it was fake.

A screen reporting *"`STRIPE_SECRET_KEY` is present"* would have shown a tick
beside every one of those. So the readiness panel asks Stripe what is true:
whether this key is live, whether the account can accept charges, whether Tax
is active, and whether an endpoint in this mode points at our URL with both
events.

One thing it cannot ask. **Whether the stored webhook secret belongs to the
endpoint it found** — Stripe shows a signing secret once, at creation, and will
not show it again. The only proof is a delivery that verified, which is why the
last accepted event is on that screen, read from our own `stripe_events` table.
A webhook that has never delivered is exactly where a sandbox secret hides.
