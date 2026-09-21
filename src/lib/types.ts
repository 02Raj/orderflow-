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
}

export interface MenuModifier {
  id: string;
  name: string;
  priceAdjustmentMinor: number;
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
  customerLabel: string | null;
  tableNumber: number | null;
  tableLabel: string | null;
  tableId: string | null;
  totalMinor: number;
  taxMinor: number;
  subtotalMinor: number;
  note: string | null;
  createdAt: string;
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
  mockMode: boolean;
}
