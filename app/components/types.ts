export type CampaignSummary = {
  id: string;
  name: string;
  subject: string;
  status: string;
  batchSize: number;
  totalRecipients: number;
  sentRecipients: number;
  availableBatches: number;
  totalBatches: number;
  memberCount: number;
};

export type AvailableBatch = {
  id: string;
  number: number;
  recipientCount: number;
  status: string;
};

export type ClaimedBatch = AvailableBatch & {
  sentCount: number;
  failedCount: number;
  gmailAccountId: string | null;
  gmailEmail: string | null;
  campaignId: string;
  campaignName: string;
  sendStatus: string | null;
  lastError: string | null;
  nextAttemptAt: string | null;
};

export type Overview = {
  user: { id: string; email: string; name: string | null; role: 'ORGANIZER' | 'VOLUNTEER' };
  campaigns: CampaignSummary[];
  campaign: CampaignSummary | null;
  availableBatches: AvailableBatch[];
  myBatches: ClaimedBatch[];
  gmailAccounts: Array<{
    id: string;
    email: string;
    displayName: string | null;
    tokenExpiresAt: string;
  }>;
  audits: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    metadataJson: string;
    createdAt: string;
    actorEmail: string | null;
  }>;
  suppressions: Array<{
    id: string;
    email: string;
    reason: string;
    createdAt: string;
  }>;
  invites: Array<{
    id: string;
    campaignId: string;
    campaignName: string;
    expiresAt: string;
    createdAt: string;
  }>;
  gmailConfigured: boolean;
  mockTransport: boolean;
};

export type AppView = 'campaign' | 'batches' | 'admin';
