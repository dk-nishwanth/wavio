import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  wa_phone_number_id TEXT, wa_waba_id TEXT, wa_token TEXT,
  wa_verify_token TEXT NOT NULL, wa_app_secret TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, phone TEXT NOT NULL,
  name TEXT, email TEXT, attrs TEXT NOT NULL DEFAULT '{}', tags TEXT NOT NULL DEFAULT '[]',
  opted_in INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
  UNIQUE(workspace_id, phone)
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open', assigned_to TEXT, unread INTEGER NOT NULL DEFAULT 0,
  last_message_at INTEGER, last_inbound_at INTEGER, last_preview TEXT,
  bot_paused INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
  contact_id TEXT NOT NULL, direction TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'text',
  body TEXT, template_name TEXT, media_url TEXT, wa_message_id TEXT, params TEXT,
  status TEXT NOT NULL DEFAULT 'queued', error TEXT, campaign_id TEXT,
  is_note INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_wa ON messages(wa_message_id);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'en',
  category TEXT NOT NULL DEFAULT 'MARKETING', body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT',
  meta_id TEXT, created_at INTEGER NOT NULL, UNIQUE(workspace_id, name, language)
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, template_id TEXT NOT NULL,
  segment_tag TEXT, status TEXT NOT NULL DEFAULT 'draft', scheduled_at INTEGER,
  total INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT NOT NULL, label TEXT,
  key_hash TEXT NOT NULL UNIQUE, key_prefix TEXT NOT NULL, allowed_origins TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, name TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}', idempotency_key TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_contact ON events(contact_id, name, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idem ON events(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, trigger_value TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, workspace_id TEXT, type TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}',
  run_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs(status, run_at);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT NOT NULL UNIQUE,
  stage TEXT NOT NULL DEFAULT 'new', score INTEGER NOT NULL DEFAULT 0, value REAL NOT NULL DEFAULT 0,
  source TEXT, owner_id TEXT, notes TEXT, follow_up_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_ws ON leads(workspace_id, stage);
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT NOT NULL,
  kind TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_act_contact ON activities(contact_id, created_at);
CREATE TABLE IF NOT EXISTS flow_runs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, automation_id TEXT NOT NULL, contact_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', waiting_node TEXT, vars TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_wait ON flow_runs(contact_id, status);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR', image_url TEXT, sku TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, number INTEGER NOT NULL, contact_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', total REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'INR',
  items TEXT NOT NULL DEFAULT '[]', provider TEXT, payment_link TEXT, payment_ref TEXT, paid_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_ws ON orders(workspace_id, created_at);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, number TEXT NOT NULL, plan TEXT NOT NULL, period TEXT NOT NULL,
  extra_seats INTEGER NOT NULL DEFAULT 0, base REAL NOT NULL, gst REAL NOT NULL, total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', payment_link TEXT, payment_ref TEXT, buyer TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, paid_at INTEGER
);
`;

const g = globalThis as unknown as { __db?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__db) {
    const file = process.env.DATABASE_PATH || "./data/app.db";
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    const d = new DatabaseSync(file);
    d.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    d.exec(SCHEMA);
    try { d.exec("ALTER TABLE automations ADD COLUMN graph TEXT"); } catch { /* column already exists */ }
    try { d.exec("ALTER TABLE workspaces ADD COLUMN pay_json TEXT"); } catch { /* column already exists */ }
    try { d.exec("ALTER TABLE workspaces ADD COLUMN meta_json TEXT"); } catch { /* column already exists */ }
    try { d.exec("ALTER TABLE workspaces ADD COLUMN plan TEXT"); } catch { /* column already exists */ }
    try { d.exec("ALTER TABLE workspaces ADD COLUMN plan_until INTEGER"); } catch { /* column already exists */ }
    try { d.exec("ALTER TABLE workspaces ADD COLUMN extra_seats INTEGER NOT NULL DEFAULT 0"); } catch { /* column already exists */ }
    try { d.exec("ALTER TABLE workspaces ADD COLUMN billing_json TEXT"); } catch { /* column already exists */ }
    g.__db = d;
  }
  return g.__db;
}

export const id = (prefix = "") => prefix + crypto.randomBytes(9).toString("base64url");
export const now = () => Date.now();

type Row = Record<string, any>;
export const all = <T = Row>(sql: string, ...p: any[]): T[] => db().prepare(sql).all(...p) as T[];
export const get = <T = Row>(sql: string, ...p: any[]): T | undefined =>
  db().prepare(sql).get(...p) as T | undefined;
export const run = (sql: string, ...p: any[]) => db().prepare(sql).run(...p);
