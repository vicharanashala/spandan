package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class CourseReportResponse {

    private String courseId;
    private List<String> lectureIds;
    private int totalLectures;
    private int totalSessions;
    private double overallPerformance;
    private double overallParticipation;

    public CourseReportResponse() {}

    public CourseReportResponse(String courseId, List<String> lectureIds, int totalLectures,
                                 int totalSessions, double overallPerformance, double overallParticipation) {
        this.courseId = courseId;
        this.lectureIds = lectureIds;
        this.totalLectures = totalLectures;
        this.totalSessions = totalSessions;
        this.overallPerformance = overallPerformance;
        this.overallParticipation = overallParticipation;
    }

    public String getCourseId() { return courseId; }
    public void setCourseId(String courseId) { this.courseId = courseId; }
    public List<String> getLectureIds() { return lectureIds; }
    public void setLectureIds(List<String> lectureIds) { this.lectureIds = lectureIds; }
    public int getTotalLectures() { return totalLectures; }
    public void setTotalLectures(int totalLectures) { this.totalLectures = totalLectures; }
    public int getTotalSessions() { return totalSessions; }
    public void setTotalSessions(int totalSessions) { this.totalSessions = totalSessions; }
    public double getOverallPerformance() { return overallPerformance; }
    public void setOverallPerformance(double overallPerformance) { this.overallPerformance = overallPerformance; }
    public double getOverallParticipation() { return overallParticipation; }
    public void setOverallParticipation(double overallParticipation) { this.overallParticipation = overallParticipation; }
}
