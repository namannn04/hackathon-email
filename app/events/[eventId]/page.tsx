import { RelayPage } from '@/app/components/relay-page';

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <RelayPage view="campaign" eventId={eventId} />;
}
