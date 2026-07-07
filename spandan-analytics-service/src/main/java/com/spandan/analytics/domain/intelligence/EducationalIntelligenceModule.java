package com.spandan.analytics.domain.intelligence;

import com.spandan.analytics.domain.entity.feature.EducationalFeatures;
import com.spandan.analytics.domain.entity.feature.StudentFeatures;

import java.util.List;
import java.util.UUID;

public interface EducationalIntelligenceModule {

    String getModuleName();

    IntelligenceResult analyze(UUID sessionId,
                                List<StudentFeatures> studentFeatures,
                                List<EducationalFeatures> educationalFeatures);
}
