// All admin pages require authentication and real-time DB data.
// force-dynamic prevents prerendering so build-time env var absence does not fail.
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
