export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  currency: string;
  locale: string;
  timezone: string;
  taxLabel: string;
  taxRateBp: number;
  taxInclusive: boolean;
  taxRegion?: string | null;
  taxNumber?: string | null;
  phone: string | null;
  address: string | null;
  orderingPaused: boolean;
  openingTime: string | null;
  closingTime: string | null;
  kitchenTargetMinutes?: number | null;
  kitchenUrgentMinutes?: number | null;
}

export interface MenuModifier {
  id: string;
  name: string;
  priceAdjustmentMinor: number;
  groupId?: string | null;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minChoices: number;
  maxChoices: number;
}

export interface MenuItem {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceMinor: number;
  isAvailable: boolean;
  unavailableReason: string | null;
  imageUrl?: string | null;
  modifiers: MenuModifier[];
  modifierGroups?: ModifierGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface DiningTable {
  id: string;
  tableNumber: number;
  label: string | null;
  area: string | null;
  qrToken: string;
  isActive: boolean;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  status?: string;
  unitPriceMinor?: number;
  lineTotalMinor?: number;
  modifiers?: { name: string; priceAdjustmentMinor?: number }[];
}

export interface Order {
  id: string;
  orderNumber: number;
  status: string;
  fulfillmentType: "dine_in" | "takeaway";
  customerLabel: string | null;
  tableNumber: number | null;
  tableLabel: string | null;
  tableId: string | null;
  totalMinor: number;
  paidMinor: number;
  correctionSummary: string | null;
  taxMinor: number;
  subtotalMinor: number;
  note: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  servedAt?: string | null;
  elapsedSeconds: number;
  items: OrderItem[];
}

export interface BillingStatus {
  status: string;
  plan: string;
  trialEndsAt: string;
  daysLeftInTrial: number;
  accessBlocked: boolean;
  priceLabel: string;
  checkoutIntervals: import('./billing-prices').BillingInterval[];
  mockMode: boolean;
}
