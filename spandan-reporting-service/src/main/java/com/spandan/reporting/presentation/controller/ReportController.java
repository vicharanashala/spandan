package com.spandan.reporting.presentation.controller;

import com.spandan.reporting.application.service.ExportService;
import com.spandan.reporting.application.service.ReportService;
import com.spandan.reporting.application.service.report.ReportAssemblyOrchestrator;
import com.spandan.reporting.domain.report.SessionReport;
import com.spandan.reporting.domain.report.StudentReport;
import com.spandan.reporting.domain.report.TeacherReport;
import com.spandan.reporting.domain.report.ClassroomReport;
import com.spandan.reporting.domain.report.LectureReport;
import com.spandan.reporting.domain.report.CourseReport;
import com.spandan.reporting.domain.report.SectionReport;
import com.spandan.reporting.domain.report.TopicReport;
import com.spandan.reporting.domain.report.ConceptReport;
import com.spandan.reporting.domain.report.TrendReport;
import com.spandan.reporting.domain.report.HistoricalReport;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportAssemblyOrchestrator orchestrator;
    private final ReportService reportService;
    private final ExportService exportService;

    public ReportController(ReportAssemblyOrchestrator orchestrator, ReportService reportService,
                            ExportService exportService) {
        this.orchestrator = orchestrator;
        this.reportService = reportService;
        this.exportService = exportService;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "UP", "service", "reporting-service"));
    }

    @GetMapping("/session/{sessionId}")
    public ResponseEntity<?> getSessionReport(@PathVariable String sessionId) {
        SessionReport report = (SessionReport) orchestrator.buildSessionReport(sessionId);
        if (report == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Session report not available"));
        }
        return ResponseEntity.ok(report);
    }

    @GetMapping("/session/{sessionId}/questions")
    public ResponseEntity<?> getQuestionReport(@PathVariable String sessionId) {
        Map<String, Object> data = orchestrator.getReportData(sessionId, "QUESTION");
        if (data == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Question report not available"));
        }
        return ResponseEntity.ok(data);
    }

    @GetMapping("/session/{sessionId}/students")
    public ResponseEntity<?> getStudentReports(@PathVariable String sessionId) {
        Object reports = orchestrator.buildAllStudentReports(sessionId);
        if (reports == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Student reports not available"));
        }
        return ResponseEntity.ok(Map.of("students", reports, "total",
                reports instanceof java.util.Collection ? ((java.util.Collection<?>) reports).size() : 0));
    }

    @GetMapping("/session/{sessionId}/students/{studentId}")
    public ResponseEntity<?> getStudentReport(@PathVariable String sessionId,
                                              @PathVariable String studentId) {
        StudentReport report = (StudentReport) orchestrator.buildStudentReport(sessionId, studentId);
        if (report == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Student report not available"));
        }
        return ResponseEntity.ok(report);
    }

    @GetMapping("/session/{sessionId}/leaderboard")
    public ResponseEntity<?> getLeaderboardReport(@PathVariable String sessionId) {
        Map<String, Object> data = orchestrator.getReportData(sessionId, "LEADERBOARD");
        if (data == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Leaderboard report not available"));
        }
        return ResponseEntity.ok(data);
    }

    @GetMapping("/session/{sessionId}/learning-objectives")
    public ResponseEntity<?> getLearningObjectivesReport(@PathVariable String sessionId) {
        Map<String, Object> data = orchestrator.getReportData(sessionId, "LEARNING_OBJECTIVE");
        if (data == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Learning objective report not available"));
        }
        return ResponseEntity.ok(data);
    }

    @GetMapping("/session/{sessionId}/teacher")
    public ResponseEntity<?> getTeacherReport(@PathVariable String sessionId) {
        TeacherReport report = (TeacherReport) orchestrator.buildTeacherReport(sessionId);
        if (report == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Teacher report not available"));
        }
        return ResponseEntity.ok(report);
    }

    @GetMapping("/session/{sessionId}/classroom")
    public ResponseEntity<?> getClassroomReport(@PathVariable String sessionId) {
        ClassroomReport report = (ClassroomReport) orchestrator.buildClassroomReport(sessionId);
        if (report == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Classroom report not available"));
        }
        return ResponseEntity.ok(report);
    }

    @GetMapping("/session/{sessionId}/classroom/sections")
    public ResponseEntity<?> getClassroomSections(@PathVariable String sessionId) {
        Object sections = orchestrator.buildSectionReports(sessionId);
        return ResponseEntity.ok(Map.of("sections", sections != null ? sections : java.util.List.of()));
    }

    @GetMapping("/session/{sessionId}/classroom/topics")
    public ResponseEntity<?> getClassroomTopics(@PathVariable String sessionId) {
        Object topics = orchestrator.buildTopicReports(sessionId);
        return ResponseEntity.ok(Map.of("topics", topics != null ? topics : java.util.List.of()));
    }

    @GetMapping("/session/{sessionId}/classroom/concepts")
    public ResponseEntity<?> getClassroomConcepts(@PathVariable String sessionId) {
        Object concepts = orchestrator.buildConceptReports(sessionId);
        return ResponseEntity.ok(Map.of("concepts", concepts != null ? concepts : java.util.List.of()));
    }

    @GetMapping("/session/{sessionId}/classroom/attention")
    public ResponseEntity<?> getAttentionStudents(@PathVariable String sessionId) {
        TeacherReport report = (TeacherReport) orchestrator.buildTeacherReport(sessionId);
        if (report == null) {
            return ResponseEntity.ok(Map.of("students", java.util.List.of(), "total", 0));
        }
        return ResponseEntity.ok(Map.of("students", report.getStudentsRequiringAttention(),
                "total", report.getStudentsRequiringAttention() != null
                        ? report.getStudentsRequiringAttention().size() : 0));
    }

    @GetMapping("/lecture/{lectureId}")
    public ResponseEntity<?> getLectureReport(@PathVariable String lectureId) {
        LectureReport report = (LectureReport) orchestrator.buildLectureReport(lectureId);
        return ResponseEntity.ok(report);
    }

    @GetMapping("/lecture/{lectureId}/sessions")
    public ResponseEntity<?> getLectureSessions(@PathVariable String lectureId) {
        LectureReport report = (LectureReport) orchestrator.buildLectureReport(lectureId);
        return ResponseEntity.ok(Map.of("sessionIds", report.getSessionIds()));
    }

    @GetMapping("/course/{courseId}")
    public ResponseEntity<?> getCourseReport(@PathVariable String courseId) {
        CourseReport report = (CourseReport) orchestrator.buildCourseReport(courseId);
        return ResponseEntity.ok(report);
    }

    @GetMapping("/course/{courseId}/lectures")
    public ResponseEntity<?> getCourseLectures(@PathVariable String courseId) {
        CourseReport report = (CourseReport) orchestrator.buildCourseReport(courseId);
        return ResponseEntity.ok(Map.of("lectureIds", report.getLectureIds()));
    }

    @GetMapping("/students/{studentId}/history")
    public ResponseEntity<?> getStudentHistory(@PathVariable String studentId) {
        HistoricalReport report = (HistoricalReport) orchestrator.buildHistoricalReport(studentId);
        if (report == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Historical report not available"));
        }
        return ResponseEntity.ok(report);
    }

    @GetMapping("/students/{studentId}/trends")
    public ResponseEntity<?> getStudentTrends(@PathVariable String studentId) {
        TrendReport report = (TrendReport) orchestrator.buildTrendReport(studentId);
        return ResponseEntity.ok(report);
    }

    @GetMapping("/students/{studentId}/concepts")
    public ResponseEntity<?> getStudentConcepts(@PathVariable String studentId) {
        HistoricalReport report = (HistoricalReport) orchestrator.buildHistoricalReport(studentId);
        if (report == null) {
            return ResponseEntity.ok(Map.of("concepts", java.util.List.of()));
        }
        return ResponseEntity.ok(Map.of("concepts", report.getConceptHistory()));
    }

    @GetMapping("/session/{sessionId}/sections/{sectionId}")
    public ResponseEntity<?> getSectionReport(@PathVariable String sessionId,
                                              @PathVariable String sectionId) {
        SectionReport report = (SectionReport) orchestrator.buildSectionReport(sessionId, sectionId);
        if (report == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Section report not available"));
        }
        return ResponseEntity.ok(report);
    }

    @GetMapping("/session/{sessionId}/topics/{topicId}")
    public ResponseEntity<?> getTopicReport(@PathVariable String sessionId,
                                            @PathVariable String topicId) {
        TopicReport report = (TopicReport) orchestrator.buildTopicReport(sessionId, topicId);
        if (report == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Topic report not available"));
        }
        return ResponseEntity.ok(report);
    }

    @GetMapping("/session/{sessionId}/concepts/{conceptId}")
    public ResponseEntity<?> getConceptReport(@PathVariable String sessionId,
                                              @PathVariable String conceptId) {
        ConceptReport report = (ConceptReport) orchestrator.buildConceptReport(sessionId, conceptId);
        if (report == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Concept report not available"));
        }
        return ResponseEntity.ok(report);
    }

    @GetMapping("/session/{sessionId}/status")
    public ResponseEntity<?> getReportStatus(@PathVariable String sessionId) {
        return ResponseEntity.ok(orchestrator.getReportStatus(sessionId));
    }

    @GetMapping("/session/{sessionId}/metadata")
    public ResponseEntity<?> getReportMetadata(@PathVariable String sessionId,
                                               @RequestParam(defaultValue = "SESSION") String analyticsType) {
        Map<String, Object> metadata = orchestrator.getReportMetadata(sessionId, analyticsType);
        if (metadata == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Metadata not available"));
        }
        return ResponseEntity.ok(metadata);
    }

    @GetMapping("/teacher/{teacherId}/recent")
    public ResponseEntity<?> getRecentReports(@PathVariable String teacherId) {
        return ResponseEntity.ok(Map.of("reports", reportService.getRecentReports(teacherId)));
    }

    @GetMapping("/session/{sessionId}/export")
    public ResponseEntity<?> getExport(@PathVariable String sessionId,
                                       @RequestParam(defaultValue = "csv") String format) {
        var job = exportService.generateExport(sessionId, format);
        if (job == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "No data available for export"));
        }
        return ResponseEntity.ok(Map.of(
                "id", job.getId().toString(),
                "sessionId", sessionId, "format", format, "status", job.getStatus()));
    }

    @GetMapping("/session/{sessionId}/export/status")
    public ResponseEntity<?> getExportStatus(@PathVariable String sessionId,
                                              @RequestParam(defaultValue = "csv") String format) {
        return ResponseEntity.ok(exportService.getExportStatus(sessionId, format));
    }
}
