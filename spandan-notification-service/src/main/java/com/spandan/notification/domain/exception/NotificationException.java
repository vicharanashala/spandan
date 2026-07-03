package com.spandan.notification.domain.exception;

public class NotificationException extends RuntimeException {

    private final String errorCode;
    private final int httpStatus;

    public NotificationException(String errorCode, String message, int httpStatus) {
        super(message);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }

    public String getErrorCode() { return errorCode; }
    public int getHttpStatus() { return httpStatus; }

    public static NotificationException notFound(UUID id) {
        return new NotificationException("NOTIFICATION_NOT_FOUND",
                "Notification with id " + id + " not found", 404);
    }

    public static NotificationException notOwned() {
        return new NotificationException("NOTIFICATION_NOT_OWNED",
                "You do not own this notification", 403);
    }

    public static NotificationException cannotRetry(UUID id) {
        return new NotificationException("CANNOT_RETRY",
                "Notification " + id + " is not in FAILED state", 400);
    }
}
