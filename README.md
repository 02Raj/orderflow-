# OrderFlow

Browser POS for independent restaurants: **QR on the table → ticket on the kitchen screen**.

This is intentionally not a full POS. Guest card capture, inventory, loyalty, payroll and delivery-app sync are out of the MVP. The product exists to stop lost and wrong kitchen tickets without buying Toast/Clover hardware.

## Run locally ($0, no credentials)

```bash
npm install
npm run dev
```

- Web PWA: http://127.0.0.1:43123
- API: http://127.0.0.1:4322

Demo venue (seeded on first API boot):

- Email: `owner@harbourandrye.demo`
- Password: `harbour-demo`

Open **Tables / QR**, tap **Open guest menu** on a phone, send a ticket, watch it land on **Kitchen**.

## Credentials later

Copy `.env.example` to `apps/api/.env`.

| Variable | Required to start? | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | No | Unset = embedded PGlite Postgres. Set to your Supabase URI in production. |
| `JWT_SECRET` | No | Change before any real restaurant. |
| `STRIPE_SECRET_KEY` | No | Unset = mock checkout so you can test trial → paid. |
| `STRIPE_PRICE_ID` | With Stripe | Recurring $29 price. |
| `STRIPE_WEBHOOK_SECRET` | With Stripe | Signature verification. |
| `APP_PUBLIC_URL` | Production | Frontend origin. |
| `CORS_ORIGINS` | Production | Comma-separated frontend origins. |
| `TRIAL_DAYS` | No | Default 45. |

Frontend talks to the API through Next rewrites (`/backend/*`), so one preview port is enough.

## Deploy

- **Web:** Vercel, root `apps/web`, env `API_INTERNAL_URL` pointing at the API.
- **API:** Railway / Render / Fly (Nest cannot be a long-running server on Vercel). Free tiers are enough until a restaurant is paying.
- **Database / Auth later:** Supabase Postgres. Apply `apps/api/src/database/schema.sql` then `rls.sql`. Nest keeps using the service connection; RLS is defence in depth for a future Realtime kitchen client.

## Product bet

See `docs/STRATEGY.md`. The first objective is one real restaurant using this during service, then paying $29/month after the 45-day trial. If tickets are not used during a real rush, stop — do not add features.
