package com.spandan.notification.presentation.dto;

public record StatsResponse(long unread, long delivered, long failed) {

    public long total() { return unread + delivered + failed; }
}
