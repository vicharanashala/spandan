package com.spandan.reporting.domain.report.component;

public class TopicPerformance {

    private String topicId;
    private String topicName;
    private double accuracy;
    private int questionsAttempted;
    private int questionsCorrect;
    private double averageResponseTimeMs;

    public TopicPerformance() {}

    public TopicPerformance(String topicId, String topicName, double accuracy, int questionsAttempted,
                            int questionsCorrect, double averageResponseTimeMs) {
        this.topicId = topicId;
        this.topicName = topicName;
        this.accuracy = accuracy;
        this.questionsAttempted = questionsAttempted;
        this.questionsCorrect = questionsCorrect;
        this.averageResponseTimeMs = averageResponseTimeMs;
    }

    public String getTopicId() { return topicId; }
    public void setTopicId(String topicId) { this.topicId = topicId; }
    public String getTopicName() { return topicName; }
    public void setTopicName(String topicName) { this.topicName = topicName; }
    public double getAccuracy() { return accuracy; }
    public void setAccuracy(double accuracy) { this.accuracy = accuracy; }
    public int getQuestionsAttempted() { return questionsAttempted; }
    public void setQuestionsAttempted(int questionsAttempted) { this.questionsAttempted = questionsAttempted; }
    public int getQuestionsCorrect() { return questionsCorrect; }
    public void setQuestionsCorrect(int questionsCorrect) { this.questionsCorrect = questionsCorrect; }
    public double getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public void setAverageResponseTimeMs(double averageResponseTimeMs) { this.averageResponseTimeMs = averageResponseTimeMs; }
}
