/**
 * Typical combined restaurant rates, not legal advice.
 * US: Tax Foundation-style average combined state + local sales tax (2025).
 * NYC is listed separately because 8.875% is what most Manhattan rooms actually charge.
 * Canada: provincial GST/HST/PST stacked as a single till rate, tax-exclusive.
 * India: standalone restaurants 5% GST without ITC; specified hotel restaurants 18% with ITC.
 * Owner can always override the rate in Settings.
 */
export interface TaxRegion {
  code: string;
  label: string;
  taxRateBp: number;
  timezone?: string;
  taxLabel?: string;
}

export const US_REGIONS: TaxRegion[] = [
  { code: "NYC", label: "New York City", taxRateBp: 888, timezone: "America/New_York" },
  { code: "AL", label: "Alabama", taxRateBp: 929, timezone: "America/Chicago" },
  { code: "AK", label: "Alaska (local only)", taxRateBp: 182, timezone: "America/Anchorage" },
  { code: "AZ", label: "Arizona", taxRateBp: 837, timezone: "America/Phoenix" },
  { code: "AR", label: "Arkansas", taxRateBp: 945, timezone: "America/Chicago" },
  { code: "CA", label: "California", taxRateBp: 885, timezone: "America/Los_Angeles" },
  { code: "CO", label: "Colorado", taxRateBp: 777, timezone: "America/Denver" },
  { code: "CT", label: "Connecticut", taxRateBp: 635, timezone: "America/New_York" },
  { code: "DE", label: "Delaware (no sales tax)", taxRateBp: 0, timezone: "America/New_York" },
  { code: "DC", label: "Washington, D.C.", taxRateBp: 600, timezone: "America/New_York" },
  { code: "FL", label: "Florida", taxRateBp: 701, timezone: "America/New_York" },
  { code: "GA", label: "Georgia", taxRateBp: 744, timezone: "America/New_York" },
  { code: "HI", label: "Hawaii GET", taxRateBp: 445, timezone: "Pacific/Honolulu", taxLabel: "GET" },
  { code: "ID", label: "Idaho", taxRateBp: 603, timezone: "America/Boise" },
  { code: "IL", label: "Illinois", taxRateBp: 886, timezone: "America/Chicago" },
  { code: "IN", label: "Indiana", taxRateBp: 700, timezone: "America/Indiana/Indianapolis" },
  { code: "IA", label: "Iowa", taxRateBp: 694, timezone: "America/Chicago" },
  { code: "KS", label: "Kansas", taxRateBp: 875, timezone: "America/Chicago" },
  { code: "KY", label: "Kentucky", taxRateBp: 600, timezone: "America/New_York" },
  { code: "LA", label: "Louisiana", taxRateBp: 956, timezone: "America/Chicago" },
  { code: "ME", label: "Maine", taxRateBp: 550, timezone: "America/New_York" },
  { code: "MD", label: "Maryland", taxRateBp: 600, timezone: "America/New_York" },
  { code: "MA", label: "Massachusetts", taxRateBp: 625, timezone: "America/New_York" },
  { code: "MI", label: "Michigan", taxRateBp: 600, timezone: "America/Detroit" },
  { code: "MN", label: "Minnesota", taxRateBp: 804, timezone: "America/Chicago" },
  { code: "MS", label: "Mississippi", taxRateBp: 707, timezone: "America/Chicago" },
  { code: "MO", label: "Missouri", taxRateBp: 835, timezone: "America/Chicago" },
  { code: "MT", label: "Montana (no sales tax)", taxRateBp: 0, timezone: "America/Denver" },
  { code: "NE", label: "Nebraska", taxRateBp: 694, timezone: "America/Chicago" },
  { code: "NV", label: "Nevada", taxRateBp: 823, timezone: "America/Los_Angeles" },
  { code: "NH", label: "New Hampshire (no sales tax)", taxRateBp: 0, timezone: "America/New_York" },
  { code: "NJ", label: "New Jersey", taxRateBp: 663, timezone: "America/New_York" },
  { code: "NM", label: "New Mexico", taxRateBp: 783, timezone: "America/Denver" },
  { code: "NY", label: "New York (state avg)", taxRateBp: 854, timezone: "America/New_York" },
  { code: "NC", label: "North Carolina", taxRateBp: 701, timezone: "America/New_York" },
  { code: "ND", label: "North Dakota", taxRateBp: 704, timezone: "America/Chicago" },
  { code: "OH", label: "Ohio", taxRateBp: 724, timezone: "America/New_York" },
  { code: "OK", label: "Oklahoma", taxRateBp: 899, timezone: "America/Chicago" },
  { code: "OR", label: "Oregon (no sales tax)", taxRateBp: 0, timezone: "America/Los_Angeles" },
  { code: "PA", label: "Pennsylvania", taxRateBp: 634, timezone: "America/New_York" },
  { code: "RI", label: "Rhode Island", taxRateBp: 700, timezone: "America/New_York" },
  { code: "SC", label: "South Carolina", taxRateBp: 749, timezone: "America/New_York" },
  { code: "SD", label: "South Dakota", taxRateBp: 611, timezone: "America/Chicago" },
  { code: "TN", label: "Tennessee", taxRateBp: 955, timezone: "America/Chicago" },
  { code: "TX", label: "Texas", taxRateBp: 820, timezone: "America/Chicago" },
  { code: "UT", label: "Utah", taxRateBp: 725, timezone: "America/Denver" },
  { code: "VT", label: "Vermont", taxRateBp: 636, timezone: "America/New_York" },
  { code: "VA", label: "Virginia", taxRateBp: 575, timezone: "America/New_York" },
  { code: "WA", label: "Washington", taxRateBp: 938, timezone: "America/Los_Angeles" },
  { code: "WV", label: "West Virginia", taxRateBp: 655, timezone: "America/New_York" },
  { code: "WI", label: "Wisconsin", taxRateBp: 561, timezone: "America/Chicago" },
  { code: "WY", label: "Wyoming", taxRateBp: 544, timezone: "America/Denver" },
];

export const CA_REGIONS: TaxRegion[] = [
  { code: "ON", label: "Ontario (HST 13%)", taxRateBp: 1300, timezone: "America/Toronto", taxLabel: "HST" },
  { code: "BC", label: "British Columbia (GST+PST 12%)", taxRateBp: 1200, timezone: "America/Vancouver", taxLabel: "GST/PST" },
  { code: "QC", label: "Quebec (GST+QST 14.975%)", taxRateBp: 1498, timezone: "America/Toronto", taxLabel: "GST/QST" },
  { code: "AB", label: "Alberta (GST 5%)", taxRateBp: 500, timezone: "America/Edmonton", taxLabel: "GST" },
  { code: "NS", label: "Nova Scotia (HST 14%)", taxRateBp: 1400, timezone: "America/Halifax", taxLabel: "HST" },
  { code: "NB", label: "New Brunswick (HST 15%)", taxRateBp: 1500, timezone: "America/Moncton", taxLabel: "HST" },
  { code: "NL", label: "Newfoundland and Labrador (HST 15%)", taxRateBp: 1500, timezone: "America/St_Johns", taxLabel: "HST" },
  { code: "PE", label: "Prince Edward Island (HST 15%)", taxRateBp: 1500, timezone: "America/Halifax", taxLabel: "HST" },
  { code: "MB", label: "Manitoba (GST+PST 12%)", taxRateBp: 1200, timezone: "America/Winnipeg", taxLabel: "GST/PST" },
  { code: "SK", label: "Saskatchewan (GST+PST 11%)", taxRateBp: 1100, timezone: "America/Regina", taxLabel: "GST/PST" },
  { code: "NT", label: "Northwest Territories (GST 5%)", taxRateBp: 500, timezone: "America/Yellowknife", taxLabel: "GST" },
  { code: "NU", label: "Nunavut (GST 5%)", taxRateBp: 500, timezone: "America/Iqaluit", taxLabel: "GST" },
  { code: "YT", label: "Yukon (GST 5%)", taxRateBp: 500, timezone: "America/Whitehorse", taxLabel: "GST" },
];

export const IN_REGIONS: TaxRegion[] = [
  { code: "STANDALONE", label: "Standalone restaurant (GST 5%, no ITC)", taxRateBp: 500, taxLabel: "GST" },
  { code: "HOTEL18", label: "Specified hotel restaurant (GST 18% with ITC)", taxRateBp: 1800, taxLabel: "GST" },
];

export function regionsForCountry(countryCode: string): TaxRegion[] {
  switch (countryCode?.toUpperCase()) {
    case "US":
      return US_REGIONS;
    case "CA":
      return CA_REGIONS;
    case "IN":
      return IN_REGIONS;
    default:
      return [];
  }
}

export function resolveRegion(countryCode: string, regionCode?: string | null): TaxRegion | null {
  if (!regionCode) return null;
  return regionsForCountry(countryCode).find((r) => r.code === regionCode) ?? null;
}
