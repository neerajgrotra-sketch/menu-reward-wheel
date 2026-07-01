import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SpinBite — One QR Code for Menu, Ordering & Promotions',
  description:
    'SpinBite gives restaurants one QR code for a live menu, commission-free ordering, and spin-to-win promotions — with session intelligence built in.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
