import { calculateTTAScore } from './scoring.js';

describe('Scoring Logic: calculateTTAScore', () => {
  const allottedTime = 30000; // 30 seconds
  const basePoints = 1000;

  it('should return basePoints when answered immediately', () => {
    // 30000ms remaining
    const score = calculateTTAScore(30000, allottedTime, basePoints, 0);
    expect(score).toBe(1000);
  });

  it('should return half points when answered exactly halfway', () => {
    // 15000ms remaining
    const score = calculateTTAScore(15000, allottedTime, basePoints, 0);
    expect(score).toBe(500);
  });

  it('should apply the 10% floor when answered at the last second', () => {
    // 100ms remaining -> ratio is 0.0033 -> raw score 3.33
    // Floor is 10% of 1000 = 100
    const score = calculateTTAScore(100, allottedTime, basePoints, 0);
    expect(score).toBe(100);
  });

  it('should return 0 if remaining time is 0', () => {
    const score = calculateTTAScore(0, allottedTime, basePoints, 0);
    expect(score).toBe(0);
  });

  it('should apply a 20% penalty per edit', () => {
    // Halfway (500 pts) with 1 edit -> 500 * 0.8 = 400
    const score1 = calculateTTAScore(15000, allottedTime, basePoints, 1);
    expect(score1).toBe(400);

    // Halfway (500 pts) with 2 edits -> 500 * 0.8 * 0.8 = 320
    const score2 = calculateTTAScore(15000, allottedTime, basePoints, 2);
    expect(score2).toBe(320);
  });

  it('should still apply floor after edit penalty', () => {
    // 1000ms remaining -> raw is 33.3 -> penalty makes it 26.6 -> floor kicks in at 100
    const score = calculateTTAScore(1000, allottedTime, basePoints, 1);
    expect(score).toBe(100);
  });
});
