import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
export type DB = BetterSQLite3Database<typeof schema>;
export const ALL_TABLES = ["counters", "settings", "actors", "activity_events", "jobs", "audit_events"] as const;
const RESOURCE_TABLES = new Set([...ALL_TABLES, "communities", "facilities", "resources", "inventories", "consumption", "facility_demand", "observations", "deliveries", "routes", "allocation_policies", "incidents", "demo_feeds", "case_messages", "artifacts", "agent_summaries", "transfer_requests", "transfer_revisions", "case_actions", "transfer_approvals", "transfers", "replenishments", "continuity_requests"]);
const CORE_SCHEMA = `CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	"work_item_id" text,
	"run_id" text,
	"actor_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"status" text NOT NULL,
	"tool_name" text,
	"args" text,
	"result" text,
	"evidence_ids" text NOT NULL,
	"changes" text NOT NULL,
	"mode" text,
	"duration_ms" integer,
	"created_at" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "activity_work_item_idx" ON "activity_events" ("work_item_id");
CREATE TABLE IF NOT EXISTS "actors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"role" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL
);
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	"ts" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"category" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"work_item_id" text,
	"policy_id" text,
	"approval_id" text,
	"rule" text,
	"evidence_ids" text NOT NULL,
	"details" text NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "audit_work_item_idx" ON "audit_events" ("work_item_id");
CREATE TABLE IF NOT EXISTS "counters" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	"work_item_id" text NOT NULL,
	"kind" text NOT NULL,
	"agent_id" text,
	"payload" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" text NOT NULL,
	"started_at" text,
	"finished_at" text
);
CREATE TABLE IF NOT EXISTS "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);`;
/** Upgrade existing resource workspaces without changing their operational records.
 * Obsolete empty tables are removed. Unexpected populated tables fail closed;
 * they must be exported and reconciled rather than silently discarded. */
function prepareSchema(sqlite: Database.Database) {
 const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[];
 const obsolete=tables.filter(t=>!RESOURCE_TABLES.has(t.name));
 for(const {name} of obsolete) {
  const quoted='"'+name.replaceAll('"','""')+'"';
  if(name!=="__drizzle_migrations" && (sqlite.prepare("SELECT count(*) n FROM "+quoted).get() as {n:number}).n>0)
   throw Error("Workspace contains unsupported populated table "+name+". Export and reconcile before upgrading.");
 }
 const foreignKeys=sqlite.pragma("foreign_keys",{simple:true});
 sqlite.pragma("foreign_keys = OFF");
 try {sqlite.transaction(()=>{
  for(const {name} of obsolete)sqlite.exec('DROP TABLE "'+name.replaceAll('"','""')+'"');
  sqlite.exec(CORE_SCHEMA);
 }).immediate();} finally {sqlite.pragma("foreign_keys = "+(foreignKeys?"ON":"OFF"));}
}
export function openDatabase(file: string | Buffer) {
 if(typeof file==="string"&&file!==":memory:")fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
 const sqlite=new Database(file);
 try {
  sqlite.pragma("journal_mode = WAL");sqlite.pragma("synchronous = FULL");sqlite.pragma("busy_timeout = 5000");
  prepareSchema(sqlite);installGuards(sqlite);
  return {sqlite,db:drizzle(sqlite,{schema})};
 } catch(error){sqlite.close();throw error;}
}
export function installGuards(sqlite: Database.Database) {
 for(const operation of ["UPDATE","DELETE"])
  sqlite.exec(`CREATE TRIGGER IF NOT EXISTS audit_events_no_${operation.toLowerCase()} BEFORE ${operation} ON audit_events BEGIN SELECT RAISE(ABORT,'audit_events is append-only'); END`);
}
export function dropGuards(sqlite: Database.Database) {
 sqlite.exec("DROP TRIGGER IF EXISTS audit_events_no_update; DROP TRIGGER IF EXISTS audit_events_no_delete;");
}
