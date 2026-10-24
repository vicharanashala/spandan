package com.spandan.analytics.application.service.intelligence;

import com.spandan.analytics.domain.entity.feature.EducationalFeatures;
import com.spandan.analytics.domain.entity.feature.StudentFeatures;
import com.spandan.analytics.domain.intelligence.EducationalIntelligenceModule;
import com.spandan.analytics.domain.intelligence.IntelligenceResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class EducationalIntelligenceOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(EducationalIntelligenceOrchestrator.class);

    private final List<EducationalIntelligenceModule> modules;

    public EducationalIntelligenceOrchestrator(List<EducationalIntelligenceModule> modules) {
        this.modules = modules;
    }

    public List<IntelligenceResult> executeModules(UUID sessionId,
                                                    List<StudentFeatures> studentFeatures,
                                                    List<EducationalFeatures> educationalFeatures) {
        List<IntelligenceResult> results = new ArrayList<>();

        for (EducationalIntelligenceModule module : modules) {
            try {
                log.info("Executing intelligence module: {} for sessionId={}", module.getModuleName(), sessionId);
                IntelligenceResult result = module.analyze(sessionId, studentFeatures, educationalFeatures);
                results.add(result);
                log.info("Intelligence module {} completed for sessionId={}", module.getModuleName(), sessionId);
            } catch (Exception e) {
                log.error("Intelligence module {} failed for sessionId={}: {}",
                        module.getModuleName(), sessionId, e.getMessage());
            }
        }

        return results;
    }

    public List<EducationalIntelligenceModule> getModules() {
        return modules;
    }
}
