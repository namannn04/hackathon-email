import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAtomicClaimSql } from '@/lib/claims/sql';

let databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases) database.close();
  databases = [];
});

function database() {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  db.exec(`
    CREATE TABLE campaigns (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE batches (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      claimed_by_id TEXT,
      claimed_at TEXT,
      gmail_account_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO campaigns VALUES ('campaign', 'ACTIVE');
    INSERT INTO batches VALUES
      ('b1', 'campaign', 1, 300, 0, 0, 'AVAILABLE', NULL, NULL, NULL, 'now', 'now'),
      ('b2', 'campaign', 2, 300, 0, 0, 'AVAILABLE', NULL, NULL, NULL, 'now', 'now'),
      ('b3', 'campaign', 3, 300, 0, 0, 'AVAILABLE', NULL, NULL, NULL, 'now', 'now');
  `);
  return db;
}

function claim(db: DatabaseSync, userId: string, ids = ['b1', 'b2', 'b3']) {
  const statement = db.prepare(buildAtomicClaimSql(ids.length));
  return statement.all(
    userId,
    '2026-08-30T00:00:00.000Z',
    '2026-08-30T00:00:00.000Z',
    'campaign',
    ...ids,
    'campaign',
    ...ids,
    ids.length,
    userId,
    ids.length,
  );
}

describe('atomic batch claims', () => {
  it('lets only the first volunteer claim the complete selection', () => {
    const db = database();
    expect(claim(db, 'volunteer-a')).toHaveLength(3);
    expect(claim(db, 'volunteer-b')).toHaveLength(0);
    const owners = db.prepare('SELECT DISTINCT claimed_by_id AS owner FROM batches').all();
    expect(owners).toEqual([{ owner: 'volunteer-a' }]);
  });

  it('claims all requested rows or none when one row is no longer available', () => {
    const db = database();
    db.prepare("UPDATE batches SET status = 'CLAIMED', claimed_by_id = 'someone' WHERE id = 'b2'").run();
    expect(claim(db, 'volunteer-a')).toHaveLength(0);
    const available = db.prepare("SELECT COUNT(*) AS count FROM batches WHERE status = 'AVAILABLE'").get() as { count: number };
    expect(available.count).toBe(2);
  });

  it('enforces the three-active-batch cap inside the same statement', () => {
    const db = database();
    db.exec("INSERT INTO batches VALUES ('existing', 'campaign', 4, 300, 0, 0, 'CLAIMED', 'volunteer-a', 'now', NULL, 'now', 'now')");
    expect(claim(db, 'volunteer-a')).toHaveLength(0);
  });
});
