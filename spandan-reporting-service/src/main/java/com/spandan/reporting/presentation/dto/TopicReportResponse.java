package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class TopicReportResponse {

    private String topicId;
    private String topicName;
    private Map<String, Object> performance;
    private List<Map<String, Object>> concepts;

    public TopicReportResponse() {}

    public TopicReportResponse(String topicId, String topicName, Map<String, Object> performance,
                                List<Map<String, Object>> concepts) {
        this.topicId = topicId;
        this.topicName = topicName;
        this.performance = performance;
        this.concepts = concepts;
    }

    public String getTopicId() { return topicId; }
    public void setTopicId(String topicId) { this.topicId = topicId; }
    public String getTopicName() { return topicName; }
    public void setTopicName(String topicName) { this.topicName = topicName; }
    public Map<String, Object> getPerformance() { return performance; }
    public void setPerformance(Map<String, Object> performance) { this.performance = performance; }
    public List<Map<String, Object>> getConcepts() { return concepts; }
    public void setConcepts(List<Map<String, Object>> concepts) { this.concepts = concepts; }
}
