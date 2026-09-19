export interface TaxProfile {
  taxRateBp: number;
  taxInclusive: boolean;
}

export interface OrderTotals {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * Tax is configured per restaurant because the same product is sold into VAT-inclusive markets
 * (UK 20%, UAE 5%, AU 10% GST) and tax-exclusive ones (US/Canada sales tax added at the till).
 * Getting this wrong makes receipts legally invalid, so it is computed once, here.
 */
export function computeTotals(grossOrNetMinor: number, profile: TaxProfile): OrderTotals {
  const { taxRateBp, taxInclusive } = profile;
  if (taxRateBp <= 0) {
    return { subtotalMinor: grossOrNetMinor, taxMinor: 0, totalMinor: grossOrNetMinor };
  }

  if (taxInclusive) {
    const taxMinor = Math.round((grossOrNetMinor * taxRateBp) / (10_000 + taxRateBp));
    return {
      subtotalMinor: grossOrNetMinor - taxMinor,
      taxMinor,
      totalMinor: grossOrNetMinor,
    };
  }

  const taxMinor = Math.round((grossOrNetMinor * taxRateBp) / 10_000);
  return {
    subtotalMinor: grossOrNetMinor,
    taxMinor,
    totalMinor: grossOrNetMinor + taxMinor,
  };
}

export function formatMinor(amountMinor: number, currency: string, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
}
