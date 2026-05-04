-- Queue app — initial schema
-- Run this in the Supabase SQL editor for your project.

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  claude_prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  phase TEXT NOT NULL DEFAULT 'future',
  queue_position INTEGER NOT NULL DEFAULT 0,
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  actual_tokens INTEGER,
  progress JSONB,
  annotation JSONB,
  tags JSONB NOT NULL DEFAULT '[]',
  created_at BIGINT NOT NULL,
  started_at BIGINT,
  completed_at BIGINT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  active_task_count INTEGER NOT NULL DEFAULT 0,
  has_running_task BOOLEAN NOT NULL DEFAULT false,
  last_synced_at BIGINT NOT NULL
);

-- Normalized progress events — lets mobile clients tail a live stream
-- without polling the tasks table on every update.
CREATE TABLE IF NOT EXISTS task_progress (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  percentage INTEGER NOT NULL,
  current_step TEXT NOT NULL,
  current_file TEXT,
  milestones JSONB NOT NULL DEFAULT '[]',
  recorded_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit_snapshots (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  used_tokens INTEGER NOT NULL,
  max_tokens INTEGER NOT NULL,
  reset_at BIGINT NOT NULL,
  recorded_at BIGINT NOT NULL
);

-- Global shared settings (API keys, token limits, toggles).
-- Device-specific settings (window position, height) stay in electron-store.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default settings
INSERT INTO settings (key, value) VALUES
  ('maxTokensPerWindow', '100000'),
  ('gitBufferEnabled',   'true'),
  ('gitBufferTokens',    '5000'),
  ('autoResumeOnReset',  'true'),
  ('voiceInputMode',     'webspeech')
ON CONFLICT (key) DO NOTHING;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS tasks_device_id_queue_position ON tasks (device_id, queue_position);
CREATE INDEX IF NOT EXISTS tasks_device_id_status ON tasks (device_id, status);
CREATE INDEX IF NOT EXISTS task_progress_task_id ON task_progress (task_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_snapshots_device_reset ON rate_limit_snapshots (device_id, reset_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE task_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE rate_limit_snapshots;

-- Row Level Security
-- This is a personal tool using the anon key — no user auth.
-- All tables are open to anon. Tighten if you add multi-user support.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access" ON tasks             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON projects          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON task_progress     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON rate_limit_snapshots FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON settings          FOR ALL TO anon USING (true) WITH CHECK (true);
