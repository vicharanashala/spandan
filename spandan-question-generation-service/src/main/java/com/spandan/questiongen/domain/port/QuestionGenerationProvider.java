package com.spandan.questiongen.domain.port;

import java.util.List;
import java.util.Map;

public interface QuestionGenerationProvider {

    String name();

    GenerationResult generate(GenerationRequest request);

    record GenerationRequest(String transcriptText, int mcqCount, int trueFalseCount,
                             int shortAnswerCount, String promptTemplate) {}

    record GenerationResult(List<GeneratedQuestionData> questions, long processingTimeMs,
                            boolean success, String errorMessage) {}

    record GeneratedQuestionData(String questionType, String questionText,
                                 Map<String, String> options, String correctAnswer,
                                 String difficulty) {}
}
