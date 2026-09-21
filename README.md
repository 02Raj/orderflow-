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
| `STRIPE_SECRET_KEY` | No | Unset = mock checkout so you can test trial → paid. |
| `STRIPE_PRICE_ID` | With Stripe | Recurring $29 price. |
| `STRIPE_WEBHOOK_SECRET` | With Stripe | Signature verification. |
| `APP_PUBLIC_URL` | Production | App origin. |
| `TRIAL_DAYS` | No | Default 45. |

API lives at `/api/*` on the same origin. SSE kitchen tickets need a long-running Node process (`npm run start`), not a serverless timeout.

## Deploy

- **App:** Vercel or any Node host that can run `next start` (SSE). Env: `JWT_SECRET`, optional `DATABASE_URL` and Stripe keys.
- **Database:** Unset `DATABASE_URL` for local PGlite. Production: Supabase Postgres. Apply `src/server/database/schema.sql` then `rls.sql`.

## Product bet

See `docs/STRATEGY.md`. The first objective is one real restaurant using this during service, then paying $29/month after the 45-day trial.
