package com.spandan.polling.presentation.dto.request;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

public record CreateQuizRequest(
        @NotEmpty List<QuestionSlot> questions,
        UUID lectureId,
        UUID sectionId,
        UUID subsectionId
) {}
