package com.spandan.reporting.domain.report;

import java.util.List;

public class CourseReport {

    private String courseId;
    private List<String> lectureIds;
    private int totalLectures;
    private int totalSessions;
    private double overallPerformance;
    private double overallParticipation;
    private List<LectureReport> lectureReports;

    public CourseReport() {}

    public CourseReport(String courseId, List<String> lectureIds, int totalLectures, int totalSessions,
                        double overallPerformance, double overallParticipation,
                        List<LectureReport> lectureReports) {
        this.courseId = courseId;
        this.lectureIds = lectureIds;
        this.totalLectures = totalLectures;
        this.totalSessions = totalSessions;
        this.overallPerformance = overallPerformance;
        this.overallParticipation = overallParticipation;
        this.lectureReports = lectureReports;
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
    public List<LectureReport> getLectureReports() { return lectureReports; }
    public void setLectureReports(List<LectureReport> lectureReports) { this.lectureReports = lectureReports; }
}
