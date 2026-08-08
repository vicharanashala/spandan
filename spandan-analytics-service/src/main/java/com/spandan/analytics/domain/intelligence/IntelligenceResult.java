package com.spandan.analytics.domain.intelligence;

import java.util.Map;

public class IntelligenceResult {

    private final String moduleName;
    private final Map<String, Object> results;

    public IntelligenceResult(String moduleName, Map<String, Object> results) {
        this.moduleName = moduleName;
        this.results = results;
    }

    public String getModuleName() { return moduleName; }
    public Map<String, Object> getResults() { return results; }
}
