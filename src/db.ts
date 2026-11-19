import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDb(home: string): DatabaseSync {
  mkdirSync(home, { recursive: true });
  const db = new DatabaseSync(join(home, "seo.db"));
  db.exec(`CREATE TABLE IF NOT EXISTS quota (
    api TEXT NOT NULL,
    property TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (api, property, day)
  )`);
  return db;
}

/** Google resets daily API quotas at midnight Pacific time. Returns YYYY-MM-DD. */
export function pacificDay(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export function quotaUsed(db: DatabaseSync, api: string, property: string, day: string = pacificDay()): number {
  const row = db
    .prepare("SELECT count FROM quota WHERE api = ? AND property = ? AND day = ?")
    .get(api, property, day) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function quotaAdd(db: DatabaseSync, api: string, property: string, day: string = pacificDay()): void {
  db.prepare(
    `INSERT INTO quota (api, property, day, count) VALUES (?, ?, ?, 1)
     ON CONFLICT (api, property, day) DO UPDATE SET count = count + 1`,
  ).run(api, property, day);
}
