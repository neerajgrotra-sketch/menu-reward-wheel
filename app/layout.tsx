import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SpinBite — Gamify Your Restaurant Menu | Spin to Win Deals',
  description:
    'SpinBite helps restaurants turn menus into QR-powered games with spin wheels, rewards, promotions, and instant redemption.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
