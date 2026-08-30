export type BatchSummary = {
  id: string;
  number: number;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: string;
};

export type MailTaskSummary = {
  id: string;
  eventId: string;
  name: string;
  toEmail: string;
  subject: string;
  batchSize: number;
  status: string;
  totalBatches: number;
  sentBatches: number;
  totalRecipients: number;
  sentRecipients: number;
  batches: BatchSummary[];
  createdAt: string;
};

export type EventSummary = {
  id: string;
  name: string;
  status: string;
  recipientCount: number;
  memberCount: number;
  mailTasks: MailTaskSummary[];
  createdAt: string;
};

export type BatchPreview = {
  batchId: string;
  batchNumber: number;
  status: string;
  eventId: string;
  eventName: string;
  mailTaskId: string;
  mailTaskName: string;
  to: string;
  bcc: string[];
  subject: string;
  bodyText: string;
  recipientCount: number;
};

export type Overview = {
  user: { id: string; email: string; name: string | null; role: 'ORGANIZER' | 'VOLUNTEER' };
  events: EventSummary[];
  event: EventSummary | null;
  mailTask: MailTaskSummary | null;
  availableBatches: BatchSummary[];
  gmailAccounts: Array<{ id: string; email: string; displayName: string | null; tokenExpiresAt: string }>;
  sentHistory: Array<{
    id: string; number: number; recipientCount: number; sentCount: number; eventId: string;
    eventName: string; mailTaskId: string; mailTaskName: string; gmailEmail: string | null; sentAt: string;
  }>;
  activities: Array<{
    id: string; action: string; status: string; emailCount: number; detail: string | null;
    actorEmail: string | null; actorName: string | null; mailTaskId: string | null; mailTaskName: string | null;
    batchNumber: number | null; createdAt: string;
  }>;
  suppressions: Array<{ id: string; email: string; reason: string; createdAt: string }>;
  invites: Array<{ id: string; eventId: string; eventName: string; expiresAt: string; createdAt: string }>;
  gmailConfigured: boolean;
  mockTransport: boolean;
};

export type AppView = 'campaign' | 'batches' | 'admin';
