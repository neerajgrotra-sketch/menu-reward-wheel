import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type ProfileRole = 'restaurant_owner' | 'super_admin';

export type CurrentProfile = {
  id: string;
  email: string | null;
  role: ProfileRole;
};

export async function getCurrentProfile() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,email,role')
    .eq('id', user.id)
    .maybeSingle();

  return {
    user,
    profile: (profile as CurrentProfile | null) || null,
  };
}

export async function requireSuperAdmin() {
  const { user, profile } = await getCurrentProfile();

  if (!user) redirect('/auth');
  if (profile?.role !== 'super_admin') redirect('/admin');

  return { user, profile };
}
