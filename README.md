# OrderFlow

Browser POS for independent restaurants: **QR on the table → ticket on the kitchen screen**.

This is a single **Next.js** app (UI + `/api` route handlers). It is not a full POS. Guest card capture, inventory, loyalty, payroll and delivery-app sync are out of the MVP.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:43123

Demo venue (seeded on first boot):

- Email: `owner@harbourandrye.demo`
- Password: `harbour-demo`

Open **Tables / QR**, tap **Open guest menu** on a phone, send a ticket, watch it land on **Kitchen**.

## Credentials later

Copy `.env.example` to `.env.local`.

| Variable | Required to start? | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | No | Unset = embedded PGlite Postgres. Set to your Supabase URI in production. |
| `JWT_SECRET` | No | Change before any real restaurant. |
| `DODO_PAYMENTS_ENV` | With Dodo | Keep `test_mode` while testing; use `live_mode` only at launch. |
| `DODO_PAYMENTS_API_KEY` | With Dodo | Server-side test/live API key. |
| `DODO_PRODUCT_ID` | With Dodo | US$29/month recurring product. |
| `DODO_YEARLY_PRODUCT_ID` | For yearly Dodo checkout | Separate US$290/year recurring product. |
| `DODO_PAYMENTS_WEBHOOK_KEY` | With Dodo | Webhook endpoint signing secret. |
| `STRIPE_SECRET_KEY` | No | Optional fallback; unset providers use mock checkout outside production. |
| `STRIPE_PRICE_ID` | With Stripe | Recurring $29 price. |
| `STRIPE_YEARLY_PRICE_ID` | For yearly Stripe checkout | Separate US$290/year recurring price. |
| `STRIPE_WEBHOOK_SECRET` | With Stripe | Signature verification. |
| `APP_PUBLIC_URL` | Production | App origin. |
| `TRIAL_DAYS` | No | Default 14. Checkout preserves only the remaining trial days. |

API lives at `/api/*` on the same origin. SSE kitchen tickets need a long-running Node process (`npm run start`), not a serverless timeout.

Apply the updated database schema to existing Postgres installations before deploying the app. The locations migration adds `restaurants.business_root_id`; existing venue IDs and QR codes stay valid.
Use separate recurring products or prices for each interval and verify the USD amount and renewal interval in the provider's test checkout before switching to live. An unconfigured yearly option is hidden in Billing settings.

Owners can use **Manage locations** to add a branch and switch between branches. Staff accounts and subscriptions are scoped to a single location.

## Deploy

- **App:** Vercel or any Node host that can run `next start` (SSE). Env: `JWT_SECRET`, optional `DATABASE_URL`, and Dodo test keys while validating billing.
- **Database:** Unset `DATABASE_URL` for local PGlite. Production: Supabase Postgres. Apply `src/server/database/schema.sql` then `rls.sql`.

## Product bet

See `docs/STRATEGY.md`. The first objective is one real restaurant using this during service, then paying $29/month after the 14-day trial.
