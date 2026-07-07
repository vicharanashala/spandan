package com.spandan.analytics.application.service.leaderboard;

import com.spandan.analytics.domain.entity.LeaderboardEntry;
import com.spandan.analytics.domain.entity.feature.StudentFeatures;
import com.spandan.analytics.infrastructure.persistence.LeaderboardEntryJpaRepository;
import com.spandan.analytics.infrastructure.persistence.feature.StudentFeaturesRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class LeaderboardService {

    private static final Logger log = LoggerFactory.getLogger(LeaderboardService.class);

    private final LeaderboardEntryJpaRepository leaderboardRepo;
    private final StudentFeaturesRepository studentFeaturesRepo;

    public LeaderboardService(LeaderboardEntryJpaRepository leaderboardRepo,
                               StudentFeaturesRepository studentFeaturesRepo) {
        this.leaderboardRepo = leaderboardRepo;
        this.studentFeaturesRepo = studentFeaturesRepo;
    }

    @Transactional
    public void computeLeaderboard(UUID sessionId) {
        List<StudentFeatures> features = studentFeaturesRepo.findBySessionId(sessionId);

        List<LeaderboardEntry> existing = leaderboardRepo.findByQuizIdOrderByRankAsc(sessionId);
        if (!existing.isEmpty()) leaderboardRepo.deleteByQuizId(sessionId);

        List<StudentFeatures> sorted = features.stream()
                .sorted(Comparator
                        .comparing(StudentFeatures::getAccuracy).reversed()
                        .thenComparing(StudentFeatures::getTotalCorrect).reversed()
                        .thenComparing(StudentFeatures::getAverageResponseTimeMs))
                .collect(Collectors.toList());

        List<LeaderboardEntry> entries = new ArrayList<>();
        int rank = 0;
        int skippedRanks = 0;
        StudentFeatures previous = null;

        for (StudentFeatures sf : sorted) {
            rank++;
            if (previous != null
                    && sf.getAccuracy().compareTo(previous.getAccuracy()) == 0
                    && sf.getTotalCorrect() == previous.getTotalCorrect()
                    && sf.getAverageResponseTimeMs() == previous.getAverageResponseTimeMs()) {
                skippedRanks++;
            } else {
                rank = rank + skippedRanks;
                skippedRanks = 0;
            }

            BigDecimal totalScore = BigDecimal.valueOf(sf.getTotalCorrect());
            entries.add(new LeaderboardEntry(sessionId, sf.getStudentId(), rank,
                    totalScore, sf.getAccuracy()));
            previous = sf;
        }

        if (!entries.isEmpty()) leaderboardRepo.saveAll(entries);
        log.info("Leaderboard computed for sessionId={}: {} entries", sessionId, entries.size());
    }

    public List<LeaderboardEntry> getLeaderboard(UUID sessionId) {
        return leaderboardRepo.findByQuizIdOrderByRankAsc(sessionId);
    }
}
