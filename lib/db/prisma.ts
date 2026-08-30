import { PrismaClient } from '@/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Use the pooled postgresql:// URL from Neon.');
  }
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

type RelayPrismaClient = ReturnType<typeof createPrismaClient>;

const prismaGlobal = globalThis as typeof globalThis & {
  __relayPrisma?: RelayPrismaClient;
};

export function getPrisma(): RelayPrismaClient {
  prismaGlobal.__relayPrisma ??= createPrismaClient();
  return prismaGlobal.__relayPrisma;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
