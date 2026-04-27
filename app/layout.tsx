import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Menu Reward Wheel',
  description: 'QR-based restaurant reward wheel promotional web app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
