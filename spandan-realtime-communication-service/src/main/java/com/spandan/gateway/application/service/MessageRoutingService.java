package com.spandan.gateway.application.service;

import com.spandan.gateway.application.port.CrossPodMessagePublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
public class MessageRoutingService {

    private final SimpMessagingTemplate messagingTemplate;
    private final CrossPodMessagePublisher crossPodPublisher;

    public MessageRoutingService(SimpMessagingTemplate messagingTemplate,
                                 CrossPodMessagePublisher crossPodPublisher) {
        this.messagingTemplate = messagingTemplate;
        this.crossPodPublisher = crossPodPublisher;
    }

    public void broadcastToQuiz(String quizId, Object payload) {
        String destination = "/topic/quiz/" + quizId;
        messagingTemplate.convertAndSend(destination, payload);
        crossPodPublisher.publish("quiz:" + quizId, destination + "|" + payload.toString());
    }

    public void broadcastToQuestion(String questionId, Object payload) {
        String destination = "/topic/question/" + questionId;
        messagingTemplate.convertAndSend(destination, payload);
    }

    public void broadcastToAdmin(String quizId, Object payload) {
        String destination = "/topic/quiz/" + quizId + "/admin";
        messagingTemplate.convertAndSend(destination, payload);
        crossPodPublisher.publish("quiz:" + quizId, destination + "|" + payload.toString());
    }

    public void broadcastToTeacher(String quizId, Object payload) {
        String destination = "/topic/quiz/" + quizId + "/teacher";
        messagingTemplate.convertAndSend(destination, payload);
    }

    public void sendToUser(String userId, String queue, Object payload) {
        messagingTemplate.convertAndSendToUser(userId, "/queue/" + queue, payload);
    }

    public void broadcastToNotifications(String quizId, Object payload) {
        messagingTemplate.convertAndSend("/topic/quiz/" + quizId + "/notifications", payload);
    }

    public void sendToPersonalNotification(String userId, Object payload) {
        messagingTemplate.convertAndSendToUser(userId, "/queue/notifications", payload);
    }

    public void broadcastLeaderboard(String quizId, Object payload) {
        messagingTemplate.convertAndSend("/topic/quiz/" + quizId + "/leaderboard", payload);
    }
}
