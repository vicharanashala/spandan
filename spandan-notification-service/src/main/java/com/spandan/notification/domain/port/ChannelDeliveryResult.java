package com.spandan.notification.domain.port;

public class ChannelDeliveryResult {

    private final boolean success;
    private final String errorMessage;

    private ChannelDeliveryResult(boolean success, String errorMessage) {
        this.success = success;
        this.errorMessage = errorMessage;
    }

    public static ChannelDeliveryResult success() {
        return new ChannelDeliveryResult(true, null);
    }

    public static ChannelDeliveryResult failure(String errorMessage) {
        return new ChannelDeliveryResult(false, errorMessage);
    }

    public boolean isSuccess() { return success; }
    public String getErrorMessage() { return errorMessage; }
}
