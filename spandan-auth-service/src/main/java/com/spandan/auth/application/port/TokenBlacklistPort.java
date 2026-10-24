package com.spandan.auth.application.port;

public interface TokenBlacklistPort {
    void blacklist(String jti, long ttlSeconds);
    boolean isBlacklisted(String jti);
}
