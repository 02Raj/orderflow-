export type BillingInterval = "monthly" | "yearly";

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export const BILLING_PRICES = {
  monthly: { name: "Monthly", amount: 29, period: "month" },
  yearly: { name: "Yearly", amount: 290, period: "year" },
} as const;

export const YEARLY_SAVINGS = BILLING_PRICES.monthly.amount * 12 - BILLING_PRICES.yearly.amount;

export function billingPriceLabel(interval: BillingInterval) {
  const { amount, period } = BILLING_PRICES[interval];
  return `US$${amount} / ${period}`;
}
