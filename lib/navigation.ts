export type NavItem = {
  label: string;
  href: string;
  icon: string;
};

export const adminNavigation: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: '🏠' },
  { label: 'Restaurants', href: '/admin/restaurants', icon: '🏪' },
  { label: 'Menu', href: '/admin/menu', icon: '🍽️' },
  { label: 'Orders', href: '/admin/orders', icon: '🧾' },
  { label: 'Promotions', href: '/admin/promotions', icon: '🎯' },
  { label: 'Coupons', href: '/admin/coupons', icon: '🎟️' },
  { label: 'Validate Coupon', href: '/admin/validate', icon: '✅' },
  { label: 'Dining Intelligence', href: '/admin/sessions', icon: '📡' },
];

export const superAdminNavigation: NavItem[] = [
  { label: 'Command Center', href: '/super-admin', icon: '🛰️' },
  { label: 'Games', href: '/super-admin/games', icon: '🎮' },
  { label: 'Homepage Content', href: '/super-admin/content', icon: '📝' },
  { label: 'FAQs', href: '/super-admin/faqs', icon: '❓' },
  { label: 'Intelligence Lab', href: '/super-admin/intelligence-lab', icon: '🧠' },
  { label: 'Settings', href: '/super-admin/settings', icon: '🚦' },
];
