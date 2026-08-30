import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error(
      'Cloudflare D1 binding `DB` is unavailable. Configure the DB binding before using Relay.',
    );
  }
  return env.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}
