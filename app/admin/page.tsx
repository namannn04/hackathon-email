import { RelayPage } from '@/app/components/relay-page';

export const dynamic = 'force-dynamic';

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ eventId?: string; mailTaskId?: string }> }) {
  const { eventId, mailTaskId } = await searchParams;
  return <RelayPage view="admin" eventId={eventId ?? null} mailTaskId={mailTaskId ?? null} />;
}
