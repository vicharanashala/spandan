CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false,
    replaced_by_token_id UUID,
    UNIQUE (token_hash)
);

CREATE INDEX idx_refresh_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_expires_at ON refresh_tokens(expires_at);
