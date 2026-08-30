import { RelayPage } from '@/app/components/relay-page';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ eventId?: string; mailTaskId?: string }> }) {
  const { eventId, mailTaskId } = await searchParams;
  return <RelayPage view="campaign" eventId={eventId ?? null} mailTaskId={mailTaskId ?? null} />;
}
