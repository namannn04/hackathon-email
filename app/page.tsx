import { RelayPage } from '@/app/components/relay-page';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ campaignId?: string }> }) {
  const { campaignId } = await searchParams;
  return <RelayPage view="campaign" campaignId={campaignId ?? null} />;
}
