export type Role = 'owner' | 'manager' | 'staff' | 'kitchen';

export interface AuthenticatedUser {
  id: string;
  restaurantId: string;
  email: string;
  fullName: string;
  role: Role;
}

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'canceled'
  | 'expired';

export type OrderStatus = 'new' | 'accepted' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type FulfillmentType = 'dine_in' | 'takeaway';

export const ROLE_RANK: Record<Role, number> = {
  kitchen: 1,
  staff: 2,
  manager: 3,
  owner: 4,
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'new',
  'accepted',
  'preparing',
  'ready',
  'served',
];
