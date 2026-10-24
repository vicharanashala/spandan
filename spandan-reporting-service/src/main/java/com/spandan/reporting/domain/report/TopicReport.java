package com.spandan.reporting.domain.report;

import com.spandan.reporting.domain.report.component.PerformanceSummary;

import java.util.List;

public class TopicReport {

    private String topicId;
    private String topicName;
    private PerformanceSummary performance;
    private List<ConceptReport> concepts;

    public TopicReport() {}

    public TopicReport(String topicId, String topicName, PerformanceSummary performance,
                       List<ConceptReport> concepts) {
        this.topicId = topicId;
        this.topicName = topicName;
        this.performance = performance;
        this.concepts = concepts;
    }

    public String getTopicId() { return topicId; }
    public void setTopicId(String topicId) { this.topicId = topicId; }
    public String getTopicName() { return topicName; }
    public void setTopicName(String topicName) { this.topicName = topicName; }
    public PerformanceSummary getPerformance() { return performance; }
    public void setPerformance(PerformanceSummary performance) { this.performance = performance; }
    public List<ConceptReport> getConcepts() { return concepts; }
    public void setConcepts(List<ConceptReport> concepts) { this.concepts = concepts; }
}
