ALTER TABLE sessions_drill ADD COLUMN client_id UUID;
CREATE UNIQUE INDEX idx_sessions_user_client ON sessions_drill(user_id, client_id);
