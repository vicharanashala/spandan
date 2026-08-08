package com.spandan.reporting.application.service.report;

import com.spandan.reporting.application.service.ReportService;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
public class ReportAssemblyOrchestrator {

    private final ReportService reportService;
    private final SessionReportBuilder sessionReportBuilder;
    private final StudentReportBuilder studentReportBuilder;
    private final TeacherReportBuilder teacherReportBuilder;
    private final ClassroomReportBuilder classroomReportBuilder;
    private final LectureReportBuilder lectureReportBuilder;
    private final SectionReportBuilder sectionReportBuilder;
    private final TopicReportBuilder topicReportBuilder;
    private final ConceptReportBuilder conceptReportBuilder;
    private final TrendReportBuilder trendReportBuilder;
    private final HistoricalReportBuilder historicalReportBuilder;
    private final CourseReportBuilder courseReportBuilder;

    public ReportAssemblyOrchestrator(ReportService reportService,
                                      SessionReportBuilder sessionReportBuilder,
                                      StudentReportBuilder studentReportBuilder,
                                      TeacherReportBuilder teacherReportBuilder,
                                      ClassroomReportBuilder classroomReportBuilder,
                                      LectureReportBuilder lectureReportBuilder,
                                      SectionReportBuilder sectionReportBuilder,
                                      TopicReportBuilder topicReportBuilder,
                                      ConceptReportBuilder conceptReportBuilder,
                                      TrendReportBuilder trendReportBuilder,
                                      HistoricalReportBuilder historicalReportBuilder,
                                      CourseReportBuilder courseReportBuilder) {
        this.reportService = reportService;
        this.sessionReportBuilder = sessionReportBuilder;
        this.studentReportBuilder = studentReportBuilder;
        this.teacherReportBuilder = teacherReportBuilder;
        this.classroomReportBuilder = classroomReportBuilder;
        this.lectureReportBuilder = lectureReportBuilder;
        this.sectionReportBuilder = sectionReportBuilder;
        this.topicReportBuilder = topicReportBuilder;
        this.conceptReportBuilder = conceptReportBuilder;
        this.trendReportBuilder = trendReportBuilder;
        this.historicalReportBuilder = historicalReportBuilder;
        this.courseReportBuilder = courseReportBuilder;
    }

    public Map<String, Object> getReportData(String sessionId, String analyticsType) {
        return reportService.getReportData(sessionId, analyticsType);
    }

    public Map<String, Object> getReportMetadata(String sessionId, String analyticsType) {
        return reportService.getReportMetadata(sessionId, analyticsType);
    }

    public Map<String, Object> getReportStatus(String sessionId) {
        return reportService.getReportStatus(sessionId);
    }

    public Object buildSessionReport(String sessionId) {
        Map<String, Object> sessionData = getReportData(sessionId, "SESSION");
        if (sessionData == null) return null;
        return sessionReportBuilder.build(sessionId, sessionData);
    }

    public Object buildStudentReport(String sessionId, String studentId) {
        return studentReportBuilder.build(sessionId, studentId, this);
    }

    public Object buildAllStudentReports(String sessionId) {
        return studentReportBuilder.buildAll(sessionId, this);
    }

    public Object buildTeacherReport(String sessionId) {
        return teacherReportBuilder.build(sessionId, this);
    }

    public Object buildClassroomReport(String sessionId) {
        return classroomReportBuilder.build(sessionId, this);
    }

    public Object buildLectureReport(String lectureId) {
        return lectureReportBuilder.build(lectureId, this);
    }

    public Object buildSectionReport(String sessionId, String sectionId) {
        return sectionReportBuilder.build(sessionId, sectionId, this);
    }

    public Object buildTopicReport(String sessionId, String topicId) {
        return topicReportBuilder.build(sessionId, topicId, this);
    }

    public Object buildConceptReport(String sessionId, String conceptId) {
        return conceptReportBuilder.build(sessionId, conceptId, this);
    }

    public Object buildTrendReport(String studentId) {
        return trendReportBuilder.build(studentId, this);
    }

    public Object buildHistoricalReport(String studentId) {
        return historicalReportBuilder.build(studentId, this);
    }

    public Object buildCourseReport(String courseId) {
        return courseReportBuilder.build(courseId, this);
    }

    public Object buildSectionReports(String sessionId) {
        return sectionReportBuilder.buildAll(sessionId, this);
    }

    public Object buildTopicReports(String sessionId) {
        return topicReportBuilder.buildAll(sessionId, this);
    }

    public Object buildConceptReports(String sessionId) {
        return conceptReportBuilder.buildAll(sessionId, this);
    }
}
