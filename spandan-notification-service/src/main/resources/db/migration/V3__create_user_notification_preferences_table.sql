CREATE TABLE user_notification_preferences (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prefs_user ON user_notification_preferences (user_id);
