/**
 * Paid billing is off until a real domain and a payment account exist.
 * Set NEXT_PUBLIC_PAYMENTS_ENABLED=true in .env.local / production when ready.
 */
export const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
