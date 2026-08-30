import { RelayPage } from '@/app/components/relay-page';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  return <RelayPage view="campaign" campaignId={campaignId} />;
}
