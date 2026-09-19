export function computeTotals(
  grossOrNetMinor: number,
  profile: { taxRateBp: number; taxInclusive: boolean },
) {
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

export function formatTaxRate(taxRateBp: number) {
  const pct = taxRateBp / 100;
  if (Number.isInteger(pct)) return `${pct}%`;
  return `${pct.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export function taxGuestHint(taxInclusive: boolean, taxLabel: string, taxRateBp: number) {
  const rate = formatTaxRate(taxRateBp);
  if (taxRateBp <= 0) return "Menu prices are what you pay at the table.";
  if (taxInclusive) return `Prices include ${taxLabel} (${rate}).`;
  return `Prices before ${taxLabel}. ${rate} is added when you pay at the table.`;
}
