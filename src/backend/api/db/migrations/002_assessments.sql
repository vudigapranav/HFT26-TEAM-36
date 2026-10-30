CREATE TABLE portfolios (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
 profile jsonb NOT NULL, portfolio jsonb NOT NULL, focus_lane jsonb,
 is_latest boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX portfolios_user ON portfolios(user_id, created_at DESC);
CREATE UNIQUE INDEX portfolios_latest ON portfolios(user_id) WHERE is_latest;
CREATE TABLE assessments (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES portfolios(id), focus_lane jsonb NOT NULL, current_tier text NOT NULL CHECK(current_tier IN ('novice','adept','master')),
 unlocks_used integer NOT NULL CHECK(unlocks_used BETWEEN 0 AND 2),
 started_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('active','finished')), auto_submit_error text,
 expired_finalized boolean NOT NULL DEFAULT false
);
CREATE INDEX assessments_user ON assessments(user_id);
CREATE UNIQUE INDEX assessments_active_user ON assessments(user_id) WHERE status='active';
CREATE INDEX assessments_expiration ON assessments(expires_at) WHERE NOT expired_finalized;
CREATE TABLE assessment_tasks (
 assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
 task_id text NOT NULL, tier text NOT NULL CHECK(tier IN ('novice','adept','master')), position integer NOT NULL,
 private_task jsonb NOT NULL, hint_level integer NOT NULL DEFAULT 0 CHECK(hint_level BETWEEN 0 AND 3),
 PRIMARY KEY(assessment_id,task_id), UNIQUE(assessment_id,tier,position)
);
CREATE TABLE task_files (
 assessment_id uuid NOT NULL, task_id text NOT NULL, path text NOT NULL, content text NOT NULL,
 PRIMARY KEY(assessment_id,task_id,path),
 FOREIGN KEY(assessment_id,task_id) REFERENCES assessment_tasks(assessment_id,task_id) ON DELETE CASCADE
);
CREATE TABLE runs (
 run_id text PRIMARY KEY, assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
 task_id text NOT NULL, result jsonb NOT NULL, ts timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(assessment_id,task_id) REFERENCES assessment_tasks(assessment_id,task_id) ON DELETE CASCADE
);
CREATE INDEX runs_assessment_ts ON runs(assessment_id,ts);
CREATE TABLE events (
 id bigserial PRIMARY KEY, assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
 ordinal integer NOT NULL, task_id text NOT NULL, type text NOT NULL, source text NOT NULL CHECK(source IN ('client','server')),
 payload jsonb NOT NULL, ts timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(assessment_id,ordinal)
);
CREATE INDEX events_assessment_ts ON events(assessment_id,ts);
CREATE TABLE reports (
 id text PRIMARY KEY, assessment_id uuid NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE, report jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX reports_user ON reports(user_id,created_at DESC);
CREATE TABLE generation_jobs (
 id uuid PRIMARY KEY, assessment_id uuid NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('queued','generating','validating','ready','failed')),
 progress jsonb NOT NULL DEFAULT '{}'::jsonb, receipts jsonb NOT NULL DEFAULT '[]'::jsonb,
 source text CHECK(source IN ('generated','seed_bank')), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX generation_jobs_user ON generation_jobs(user_id);
CREATE INDEX generation_jobs_pending ON generation_jobs(status) WHERE status IN ('queued','generating','validating');
