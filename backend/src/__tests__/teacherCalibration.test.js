// Unit tests for Teacher Calibration Score calculations
// Tests drift, calibration score, and average absolute deviation

describe('Teacher Calibration Logic', () => {
  const calculateCalibration = (predicted, actual) => {
    const drift = predicted - actual
    const mae = Math.abs(drift)
    const calibrationScore = 100 - mae
    
    let classification = 'Highly Calibrated'
    if (drift > 5) classification = 'Overestimating'
    if (drift < -5) classification = 'Underestimating'
    
    return { drift, mae, calibrationScore, classification }
  };

  it('should correctly calculate perfect calibration', () => {
    const { drift, mae, calibrationScore, classification } = calculateCalibration(75, 75)
    expect(drift).toBe(0)
    expect(mae).toBe(0)
    expect(calibrationScore).toBe(100)
    expect(classification).toBe('Highly Calibrated')
  })

  it('should identify overestimation drift', () => {
    const { drift, mae, calibrationScore, classification } = calculateCalibration(80, 50)
    expect(drift).toBe(30)
    expect(mae).toBe(30)
    expect(calibrationScore).toBe(70)
    expect(classification).toBe('Overestimating')
  })

  it('should identify underestimation drift', () => {
    const { drift, mae, calibrationScore, classification } = calculateCalibration(30, 60)
    expect(drift).toBe(-30)
    expect(mae).toBe(30)
    expect(calibrationScore).toBe(70)
    expect(classification).toBe('Underestimating')
  })

  it('should handle borderline calibration cases', () => {
    const edgeCase1 = calculateCalibration(50, 46) // drift = 4
    expect(edgeCase1.classification).toBe('Highly Calibrated')

    const edgeCase2 = calculateCalibration(50, 44) // drift = 6
    expect(edgeCase2.classification).toBe('Overestimating')

    const edgeCase3 = calculateCalibration(44, 50) // drift = -6
    expect(edgeCase3.classification).toBe('Underestimating')
  })

  it('should aggregate long-term calibration metrics correctly', () => {
    // Mock historical question data
    const history = [
      { predicted: 80, actual: 70 }, // drift = 10, absolute = 10
      { predicted: 40, actual: 50 }, // drift = -10, absolute = 10
      { predicted: 60, actual: 60 }  // drift = 0, absolute = 0
    ]

    const total = history.length
    const sumDrift = history.reduce((sum, h) => sum + (h.predicted - h.actual), 0)
    const sumAbsoluteError = history.reduce((sum, h) => sum + Math.abs(h.predicted - h.actual), 0)

    const averageDrift = sumDrift / total
    const meanAbsoluteError = sumAbsoluteError / total
    const overallCalibrationScore = 100 - meanAbsoluteError

    expect(averageDrift).toBe(0) // Overestimation cancelled out underestimation (+10 + -10 + 0)
    expect(meanAbsoluteError).toBe(20 / 3) // Average absolute mistake is 6.67%
    expect(overallCalibrationScore).toBeCloseTo(93.33, 2)
  })
})
