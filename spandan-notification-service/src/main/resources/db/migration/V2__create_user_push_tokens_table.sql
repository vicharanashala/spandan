CREATE TABLE user_push_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    push_token TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_push_tokens
    ADD CONSTRAINT uq_user_device UNIQUE (user_id, device_id);

CREATE INDEX idx_push_tokens_user ON user_push_tokens (user_id);
