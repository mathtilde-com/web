CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  birth_date DATE,
  gender VARCHAR(20) CHECK (gender IN ('male','female','non-binary','other','prefer_not_to_say')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions_drill (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_duration_ms INTEGER NOT NULL,
  rules_version SMALLINT NOT NULL DEFAULT 1,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE question_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions_drill(id) ON DELETE CASCADE,
  question_index SMALLINT NOT NULL CHECK (question_index BETWEEN 1 AND 60),
  num1 SMALLINT NOT NULL,
  num2 SMALLINT NOT NULL,
  operator VARCHAR(1) NOT NULL CHECK (operator IN ('+','-','*','/')),
  expected_answer SMALLINT NOT NULL,
  attempts_count SMALLINT NOT NULL DEFAULT 1,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions_drill(user_id);
CREATE INDEX idx_sessions_completed ON sessions_drill(user_id, completed_at);
CREATE INDEX idx_logs_session ON question_logs(session_id);
