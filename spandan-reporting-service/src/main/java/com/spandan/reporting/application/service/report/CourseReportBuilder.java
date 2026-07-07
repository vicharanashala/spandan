package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.CourseReport;
import com.spandan.reporting.domain.report.LectureReport;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class CourseReportBuilder {

    public CourseReport build(String courseId, ReportAssemblyOrchestrator orchestrator) {
        return new CourseReport(courseId, List.of(), 0, 0, 0, 0, List.of());
    }
}
