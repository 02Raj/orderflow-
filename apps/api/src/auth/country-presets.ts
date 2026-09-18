export interface CountryPreset {
  countryCode: string;
  label: string;
  currency: string;
  locale: string;
  timezone: string;
  taxLabel: string;
  /** Tax rate in basis points: 500 = 5%. */
  taxRateBp: number;
  /** True where menu prices legally include tax (UK, UAE, AU); false where tax is added at the till (US, CA). */
  taxInclusive: boolean;
  taxNumberLabel: string;
}

/**
 * The only country-specific logic in the product. Everything else is market neutral.
 * Rates reflect standard restaurant rates at time of writing; owners can override them in Settings,
 * and the app never gives tax advice.
 */
export const COUNTRY_PRESETS: CountryPreset[] = [
  {
    countryCode: 'AE',
    label: 'United Arab Emirates',
    currency: 'AED',
    locale: 'en-AE',
    timezone: 'Asia/Dubai',
    taxLabel: 'VAT',
    taxRateBp: 500,
    taxInclusive: true,
    taxNumberLabel: 'TRN',
  },
  {
    countryCode: 'SA',
    label: 'Saudi Arabia',
    currency: 'SAR',
    locale: 'en-SA',
    timezone: 'Asia/Riyadh',
    taxLabel: 'VAT',
    taxRateBp: 1500,
    taxInclusive: true,
    taxNumberLabel: 'VAT number',
  },
  {
    countryCode: 'QA',
    label: 'Qatar',
    currency: 'QAR',
    locale: 'en-QA',
    timezone: 'Asia/Qatar',
    taxLabel: 'Tax',
    taxRateBp: 0,
    taxInclusive: true,
    taxNumberLabel: 'Tax ID',
  },
  {
    countryCode: 'GB',
    label: 'United Kingdom',
    currency: 'GBP',
    locale: 'en-GB',
    timezone: 'Europe/London',
    taxLabel: 'VAT',
    taxRateBp: 2000,
    taxInclusive: true,
    taxNumberLabel: 'VAT number',
  },
  {
    countryCode: 'AU',
    label: 'Australia',
    currency: 'AUD',
    locale: 'en-AU',
    timezone: 'Australia/Sydney',
    taxLabel: 'GST',
    taxRateBp: 1000,
    taxInclusive: true,
    taxNumberLabel: 'ABN',
  },
  {
    countryCode: 'CA',
    label: 'Canada',
    currency: 'CAD',
    locale: 'en-CA',
    timezone: 'America/Toronto',
    taxLabel: 'Tax',
    taxRateBp: 1300,
    taxInclusive: false,
    taxNumberLabel: 'GST/HST number',
  },
  {
    countryCode: 'US',
    label: 'United States',
    currency: 'USD',
    locale: 'en-US',
    timezone: 'America/New_York',
    taxLabel: 'Sales tax',
    taxRateBp: 875,
    taxInclusive: false,
    taxNumberLabel: 'Tax ID',
  },
  {
    countryCode: 'IN',
    label: 'India',
    currency: 'INR',
    locale: 'en-IN',
    timezone: 'Asia/Kolkata',
    taxLabel: 'GST',
    taxRateBp: 500,
    taxInclusive: true,
    taxNumberLabel: 'GSTIN',
  },
  {
    countryCode: 'SG',
    label: 'Singapore',
    currency: 'SGD',
    locale: 'en-SG',
    timezone: 'Asia/Singapore',
    taxLabel: 'GST',
    taxRateBp: 900,
    taxInclusive: true,
    taxNumberLabel: 'GST number',
  },
];

export function resolvePreset(countryCode: string): CountryPreset {
  return (
    COUNTRY_PRESETS.find((p) => p.countryCode === countryCode?.toUpperCase()) ?? COUNTRY_PRESETS[0]
  );
}
