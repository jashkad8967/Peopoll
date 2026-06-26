// Deterministic, fluctuating vote-share simulation.
//
// Generates a time series of percentage values per option that "wiggles"
// over time (as if different users voted at different moments) while
// converging on the poll's current real percentages at the most recent
// point. Output is deterministic per poll id so charts stay stable across
// re-renders instead of jumping around on every frame.

export const DAY_MS = 24 * 60 * 60 * 1000;

export const TREND_RANGES = [
  { id: '1d', label: '1 Day', windowMs: DAY_MS },
  { id: '3d', label: '3 Days', windowMs: 3 * DAY_MS },
  { id: '1w', label: 'Week', windowMs: 7 * DAY_MS },
  { id: 'all', label: 'All Time', windowMs: null }
];

export function toMillis(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function getOptionCounts(options) {
  return options.map((option) => Number(option.count ?? option.votes ?? 0));
}

// Deterministic hash -> a stable pseudo-random value in [0, 1) for a given
// string seed. Keeps the simulated wiggle identical across re-renders.
function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Smooth, deterministic oscillation in roughly [-1, 1] for a seed + time.
// Combines two sine waves at different frequencies so the curve looks
// organic rather than a single clean wave.
function wiggle(seed, t) {
  const a = hashSeed(`${seed}-a`) * Math.PI * 2;
  const b = hashSeed(`${seed}-b`) * Math.PI * 2;
  const f1 = 1.7 + hashSeed(`${seed}-f1`) * 2.5;
  const f2 = 4.3 + hashSeed(`${seed}-f2`) * 3.5;
  return (Math.sin(t * f1 + a) * 0.65 + Math.sin(t * f2 + b) * 0.35);
}

// Returns [{ time, percentages: { [optionId]: number } }] sorted by time.
//
// Generates a fluctuating series: each option's vote share wiggles over time
// (as if votes arrived at different moments) and all options converge on the
// poll's real current percentages at the most recent point. The amplitude
// grows with a point's age — recent points hug the real value while older
// points swing wider — so the line genuinely fluctuates instead of sitting
// flat. Output is deterministic per poll/option id so the chart is stable
// across re-renders.
export function simulateTrendPoints(poll, options, windowMs) {
  if (!options || options.length === 0) {
    return [];
  }

  const now = Date.now();
  const createdAt = toMillis(poll?.createdAt) || now - 7 * DAY_MS;

  // Time window: explicit range, or full lifetime (capped so we always
  // have a sensible span even for brand-new polls). Never look back further
  // than the poll has existed.
  const lifeSpan = Math.max(6 * 60 * 60 * 1000, now - createdAt);
  const span = windowMs ? Math.min(windowMs, lifeSpan) : lifeSpan;
  const startTime = now - span;

  const counts = getOptionCounts(options);
  const totalVotes = counts.reduce((sum, value) => sum + value, 0);

  // Real current distribution (even split as fallback) — the value each
  // option's line lands on at "now".
  const target = options.map((option, index) =>
    totalVotes > 0 ? (counts[index] / totalVotes) * 100 : 100 / options.length
  );

  const pollSeed = String(poll?.id ?? poll?.pollId ?? 'poll');

  // Sample the window at several points so the line has room to fluctuate.
  const STEPS = 24;
  const points = [];
  for (let step = 0; step <= STEPS; step += 1) {
    const progress = step / STEPS; // 0 (oldest) -> 1 (now)
    const time = startTime + progress * span;

    // Amplitude shrinks to 0 as we approach "now" so the final point lands
    // exactly on the real percentages; older points swing wider.
    const amplitude = (1 - progress) * 22;

    // Raw fluctuating value per option, clamped to a sane range.
    const raw = options.map((option, index) => {
      const offset = wiggle(`${pollSeed}-${option.id}`, progress * 6) * amplitude;
      return Math.max(2, target[index] + offset);
    });

    // Renormalize so the option shares always sum to 100 at this timestamp.
    const sum = raw.reduce((acc, value) => acc + value, 0) || 1;
    const percentages = options.reduce((acc, option, index) => {
      acc[option.id] = (raw[index] / sum) * 100;
      return acc;
    }, {});

    points.push({ time, percentages });
  }

  // Pin the final point to the exact real percentages.
  const last = points[points.length - 1];
  options.forEach((option, index) => {
    last.percentages[option.id] = target[index];
  });

  return points;
}
