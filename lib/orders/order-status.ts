export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';

// Orders considered "in flight" — not yet completed or cancelled. Single
// source of truth for what counts as an active order (Rule 13); the orders
// inbox and the Dining Intelligence restaurant tiles both filter on this.
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['pending', 'preparing', 'ready'];
