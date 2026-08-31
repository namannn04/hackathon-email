import { AuthPage } from '@/app/components/auth-page';
import { getNeonAuth, isNeonAuthConfigured } from '@/lib/auth/neon';
import { getSafeAuthRedirect } from '@/lib/auth/redirect';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type AuthSearchParams = {
  redirectTo?: string;
  callbackURL?: string;
  loggedOut?: string;
};

export default async function NeonAuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<AuthSearchParams>;
}) {
  const [{ path }, search] = await Promise.all([params, searchParams]);
  const fallback = path === 'sign-out' ? '/auth/sign-in?loggedOut=1' : '/dashboard';
  const redirectTo = getSafeAuthRedirect([search.redirectTo, search.callbackURL], fallback);

  if (isNeonAuthConfigured() && (path === 'sign-in' || path === 'sign-up')) {
    const { data: session } = await getNeonAuth().getSession();
    if (session?.user) redirect(redirectTo);
  }

  return <AuthPage path={path} redirectTo={redirectTo} loggedOut={search.loggedOut === '1'} />;
}
