package com.spandan.polling.presentation.dto.request;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record CreateQuizRequest(
        @NotEmpty List<QuestionSlot> questions
) {}
