const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

// Stage (%) = annual extraction / annual extractable resource x 100.
export function stageOfExtraction(extraction, extractable) {
  if (extraction === null || extraction === undefined || extractable === null || extractable === undefined) return null;
  if (!isFiniteNumber(extraction) || !isFiniteNumber(extractable) || extraction < 0 || extractable <= 0) return null;
  const stage = (extraction / extractable) * 100;
  return Number.isFinite(stage) ? stage : null;
}

// Category thresholds use inclusive upper bounds: <=70 Safe, <=90 Semi-critical, <=100 Critical.
export function classifyStage(stage) {
  if (stage === null || stage === undefined || !isFiniteNumber(stage) || stage < 0) return null;
  if (stage <= 70) return "Safe";
  if (stage <= 90) return "Semi-critical";
  if (stage <= 100) return "Critical";
  return "Over-exploited";
}

// Years = ln(thresholdPct x extractable / (100 x extraction)) / ln(1 + growthPct / 100).
export function yearsToThreshold(extraction, extractable, thresholdPct, growthPct) {
  const stage = stageOfExtraction(extraction, extractable);
  if (stage === null || !isFiniteNumber(thresholdPct) || thresholdPct <= 0 || !isFiniteNumber(growthPct)) return null;
  if (stage > thresholdPct) return 0;
  if (growthPct <= 0 || extraction <= 0) return null;
  const years = Math.log((thresholdPct * extractable) / (100 * extraction)) / Math.log(1 + growthPct / 100);
  return Number.isFinite(years) && years >= 0 ? years : null;
}

// Reduction needed = max(0, current extraction - target extraction at the selected stage).
export function calculateReductionNeeded(extraction, extractable, targetStage) {
  if (stageOfExtraction(extraction, extractable) === null || !isFiniteNumber(targetStage) || targetStage <= 0 || targetStage > 100) return null;
  return Math.max(0, extraction - (targetStage / 100) * extractable);
}

// Extra recharge needed = max(0, current extraction / target fraction - current extractable resource).
export function calculateExtraRechargeNeeded(extraction, extractable, targetStage) {
  if (stageOfExtraction(extraction, extractable) === null || !isFiniteNumber(targetStage) || targetStage <= 0 || targetStage > 100) return null;
  return Math.max(0, extraction / (targetStage / 100) - extractable);
}

// Headroom = target extraction at the selected stage - current extraction.
export function calculateHeadroom(extraction, extractable, targetStage) {
  if (stageOfExtraction(extraction, extractable) === null || !isFiniteNumber(targetStage) || targetStage <= 0 || targetStage > 100) return null;
  return Math.max(0, (targetStage / 100) * extractable - extraction);
}

// Least-squares slope = sum((year - meanYear) * (depth - meanDepth)) / sum((year - meanYear)^2).
// R2 = 1 - sum((depth - predictedDepth)^2) / sum((depth - meanDepth)^2).
export function linearRegression(points, startYear) {
  const selected = points.filter(({ year, depth }) =>
    isFiniteNumber(year) && year >= startYear && isFiniteNumber(depth)
  );
  const n = selected.length;
  if (n < 2) return null;

  const meanYear = selected.reduce((sum, point) => sum + point.year, 0) / n;
  const meanDepth = selected.reduce((sum, point) => sum + point.depth, 0) / n;
  const yearVariance = selected.reduce((sum, point) => sum + (point.year - meanYear) ** 2, 0);
  if (yearVariance === 0) return null;

  const covariance = selected.reduce((sum, point) =>
    sum + (point.year - meanYear) * (point.depth - meanDepth), 0
  );
  const slope = covariance / yearVariance;
  // Intercept = meanDepth - slope * meanYear.
  const intercept = meanDepth - slope * meanYear;
  const residualSum = selected.reduce((sum, point) =>
    sum + (point.depth - (slope * point.year + intercept)) ** 2, 0
  );
  const totalSum = selected.reduce((sum, point) => sum + (point.depth - meanDepth) ** 2, 0);
  // R2 = 1 - residual sum of squares / total sum of squares.
  const r2 = totalSum === 0 ? (residualSum === 0 ? 1 : 0) : 1 - residualSum / totalSum;
  return { slope, intercept, r2, n };
}

// Solving targetDepth = slope * year + intercept gives year = (targetDepth - intercept) / slope.
export function predictYearForDepth(slope, intercept, targetDepth) {
  if (!isFiniteNumber(slope) || slope <= 0 || !isFiniteNumber(intercept) || !isFiniteNumber(targetDepth)) return null;
  const year = (targetDepth - intercept) / slope;
  return Number.isFinite(year) ? year : null;
}

export function breakSeriesGaps(points) {
  return points.flatMap((point, index) => {
    if (index === 0) return [point];
    const previous = points[index - 1];
    return point.year - previous.year > 3
      ? [{ year: previous.year + 1, depth: null, n: null }, point]
      : [point];
  });
}

export function trendMessageKey(slope) {
  if (!isFiniteNumber(slope)) return null;
  if (slope < -0.1) return "recoveringTrend";
  if (slope <= 0.1) return "almostFlatTrend";
  return null;
}

export function criticalYearStatusKey(slope, r2, alreadyReached) {
  if (alreadyReached) return "alreadyReachedYear";
  if (!isFiniteNumber(slope)) return null;
  if (slope < -0.1) return "notApplicable";
  if ((!isFiniteNumber(r2) || r2 < 0.3) && slope >= 0) return "noReliableTrend";
  if (slope <= 0.1) return "notApplicable";
  if (!isFiniteNumber(r2) || r2 < 0.3) return "noReliableTrend";
  return null;
}