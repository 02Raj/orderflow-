# OrderFlow strategy (evidence and constraints)

This document is the product bet behind the code. It is not a promise that restaurants will pay. The code exists to test that bet.

## Facts (cited)

- Broader POS software market: about **$17.13B in 2025**, to **$38.82B by 2033**, **10.8% CAGR** (Grand View Research, POS software market). https://www.grandviewresearch.com/industry-analysis/point-of-sale-pos-software-market
- Restaurant POS *management system* estimates are higher and inconsistent across firms: Future Market Insights puts the category at **$18.5B in 2025** with **11.9% CAGR** to 2035. Treat market-size figures as directional, not budget inputs. https://www.futuremarketinsights.com/reports/pos-restaurant-management-system-market
- Toast is the US restaurant default at scale (**120k+ locations** cited from Toast 2025 reporting in industry roundups). Paid POS often **$69/mo per terminal** plus processing; hardware **$799–$1,300** if not on a $0 starter kit; **1–3 year contracts** are common. https://restaurantbottomline.com/2026/08/19/toast-vs-clover-vs-square-full-2026-pos-comparison-for-restaurants/ and https://www.directorders.com/blog/restaurant-pos-system-cost
- Square for Restaurants: free plan exists; Plus about **$60/mo per location**; month-to-month; processing **2.6% + $0.10**. Same sources.
- Clover: software often **$79–$179/mo** depending on QSR vs full service; **36–48 month** deals common; pricing via resellers. Same sources.
- Year-one US restaurant POS cost (hardware + software + setup) is frequently **$1,000–$10,000**, with processing on $50k monthly card volume **$12k–$18k/year**. https://www.directorders.com/blog/restaurant-pos-system-cost
- Operators on Reddit (r/restaurant, r/restaurantowners, r/ToastPOS, r/CloverPOS, 2024–2026) repeatedly describe **POS freeze during dinner rush**, **kitchen printers dropping**, **tickets that never fire**, and **incomplete modifiers**. These are operational failures during peak, not “nice to have analytics” problems.
  - https://www.reddit.com/r/restaurant/comments/1sul2od/pos_system_randomly_freezing_and_kitchen_printers/
  - https://www.reddit.com/r/CloverPOS/comments/1iv1yzs/clover_only_fires_some_orders_to_kitchen_printer/
  - https://www.reddit.com/r/ToastPOS/comments/1eh69fa/incomplete_tickets_printing/

## Market observations (pattern, not a census)

- Small independent venues are price-sensitive and hate hardware lock-in more than they hate a missing loyalty module.
- KDS is usually an add-on in full POS suites. Paper tickets and shouting remain the workaround.
- GCC (Foodics and peers) is a different competitive set than US Toast. English UI still works in UAE professional F&B; Arabic is a later expansion, not MVP.

## Hypotheses (must be validated)

- H1: Independent 1-location restaurants will complete signup → menu → QR → first real ticket in under 10 minutes.
- H2: They will use it during a real service, not just a demo.
- H3: They will pay **$29/month** after a **45-day** trial because lost tickets and wrong modifiers are visible money.
- H4: Cold Gmail to independent owners can produce conversations. This is the weakest hypothesis; expect low reply rates.

## Why this wedge (QR + kitchen tickets) and not a full POS

A full POS fights Toast on payments, hardware, payroll and integrations. A solo developer loses that fight. A kitchen ticket that cannot get lost is a painkiller with a closed workflow: scan → ticket → status. Payments stay at the table, which also avoids PCI scope in the MVP.

## Explicit non-goals until 5 paying venues

Guest card capture, inventory, loyalty, HR, accounting, delivery aggregators, native apps, AI, offline mode, Arabic UI.

## Pricing

One plan: **$29/month** (annual 20% off later if anyone asks). Trial 45 days, no card required. Below TouchBistro/Lightspeed/Foodics list prices; above “toy” pricing. ROI story: two prevented $15 mistakes per day dwarfs $29. That story is a **hypothesis**, not a measured customer result.

## Acquisition

Gmail, 20–30 personalised notes/day, independent restaurants from Maps. Demo is five minutes: paste menu, scan QR, ticket on kitchen board. First 10 customers are white-glove. Stop if 100 emails + 10 demos produce zero weekly-active trials.

## Continue / pivot / stop (90 days)

- Continue: ≥3 venues using it in live service and ≥1 paid conversion, or a written “I will pay if X is fixed” from a venue already using it weekly.
- Pivot: usage without payment → price or packaging; payment interest without usage → the workflow is wrong.
- Stop: polite interest, empty menus, no tickets during real hours.
