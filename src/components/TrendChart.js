import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { simulateTrendPoints, TREND_RANGES, toMillis } from '../utils/trendSimulation';

const CHART_PALETTE = ['#0095f6', '#e64980', '#0ca678', '#f76707', '#7048e8', '#00b8d9'];

function formatAxisLabel(time, windowMs) {
  const date = new Date(time);
  if (windowMs && windowMs <= 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTooltipTime(time) {
  // Always show the exact moment of the data point, down to the minute.
  const date = new Date(time);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

// Builds a cumulative vote-share series from real timestamped snapshots,
// filtered to the selected time window. The series is anchored so its final
// point lands exactly on the poll's current percentages: any votes that
// predate the recorded snapshots (e.g. a seeded baseline) are folded into the
// starting value. Returns null when there isn't enough real data to draw a
// meaningful line.
function buildRealSeries(snapshots, options, windowMs, poll) {
  const sorted = (snapshots || [])
    .map((snap) => ({ time: toMillis(snap.timestamp), counts: snap.counts || {} }))
    .filter((snap) => snap.time)
    .sort((a, b) => a.time - b.time);

  if (sorted.length < 1) {
    return null;
  }

  // Current real totals (the values shown on the poll) and the total captured
  // by the snapshots. The difference is the baseline that existed before the
  // first recorded snapshot, which we seed the cumulative line with so the
  // final point matches the displayed percentages exactly.
  const cumulative = {};
  options.forEach((option) => {
    const realTotal = Number(option.count ?? option.votes ?? 0);
    const captured = sorted.reduce((sum, snap) => sum + Number(snap.counts[option.id] || 0), 0);
    cumulative[option.id] = Math.max(0, realTotal - captured);
  });

  const points = [];

  // Starting point at poll creation, showing the baseline distribution before
  // any of the recorded votes landed.
  const createdAt = toMillis(poll?.createdAt);
  const baselineTotal = options.reduce((sum, option) => sum + cumulative[option.id], 0);
  if (createdAt && createdAt < sorted[0].time && baselineTotal > 0) {
    const basePct = {};
    options.forEach((option) => {
      basePct[option.id] = (cumulative[option.id] / baselineTotal) * 100;
    });
    points.push({ time: createdAt, percentages: basePct });
  }

  sorted.forEach((snap) => {
    options.forEach((option) => {
      cumulative[option.id] = Math.max(0, cumulative[option.id] + Number(snap.counts[option.id] || 0));
    });
    const total = options.reduce((sum, option) => sum + cumulative[option.id], 0);
    const percentages = {};
    options.forEach((option) => {
      percentages[option.id] = total > 0 ? (cumulative[option.id] / total) * 100 : 0;
    });
    points.push({ time: snap.time, percentages });
  });

  if (points.length < 2) {
    return null;
  }

  const now = Date.now();
  if (!windowMs) {
    return points;
  }

  const cutoff = now - windowMs;
  const firstInIdx = points.findIndex((point) => point.time >= cutoff);
  if (firstInIdx === -1) {
    return null;
  }

  const inWindow = points.slice(firstInIdx);

  if (firstInIdx > 0) {
    // The trend already existed before this window opened, so anchor the
    // left edge at the cutoff carrying the value in from the prior point.
    const prior = points[firstInIdx - 1];
    const anchored = [{ time: cutoff, percentages: { ...prior.percentages } }, ...inWindow];
    return anchored.length >= 2 ? anchored : null;
  }

  // The very first vote falls inside this window — start the line exactly
  // when voting began rather than padding with a flat lead-in.
  return inWindow.length >= 2 ? inWindow : null;
}

// Smooths a polyline into a flowing curve using a centripetal Catmull-Rom
// spline. Each original segment is subdivided into several interpolated points
// so the rendered line bends gently through the data instead of showing sharp
// elbows. Returns a denser array of { x, y } coordinates.
function smoothCoords(coords, resolution = 14) {
  if (coords.length < 3) {
    return coords;
  }

  const result = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] || coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;

    for (let step = 0; step < resolution; step += 1) {
      const t = step / resolution;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        ((2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        ((2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

      result.push({ x, y });
    }
  }
  result.push(coords[coords.length - 1]);
  return result;
}

// Resamples a {time, percentages} series onto a fixed grid of evenly spaced
// timestamps across its span — like the ticks on a stock chart. The window is
// split into `sampleCount` equal slices and at each slice boundary we read the
// vote share "as of" that moment (linearly interpolated between the two
// surrounding real data points). This yields a dense, uniformly spaced line
// that renders smoothly, while the final sample still lands on the live totals.
function resampleSeries(points, sampleCount = 100) {
  if (points.length < 2) {
    return points;
  }

  const minTime = points[0].time;
  const maxTime = points[points.length - 1].time;
  const span = Math.max(1, maxTime - minTime);
  const ids = Object.keys(points[points.length - 1].percentages);

  const result = [];
  let idx = 0;
  for (let i = 0; i <= sampleCount; i += 1) {
    const time = minTime + (span * i) / sampleCount;

    // Advance to the segment [a, b] that contains this sample time.
    while (idx < points.length - 2 && points[idx + 1].time < time) {
      idx += 1;
    }
    const a = points[idx];
    const b = points[idx + 1] || a;
    const segSpan = Math.max(1, b.time - a.time);
    const t = Math.max(0, Math.min(1, (time - a.time) / segSpan));

    const percentages = {};
    ids.forEach((id) => {
      const av = a.percentages[id] || 0;
      const bv = b.percentages[id] != null ? b.percentages[id] : av;
      percentages[id] = av + (bv - av) * t;
    });
    result.push({ time, percentages });
  }

  // Pin the final sample to the exact latest values (live totals).
  result[result.length - 1] = {
    time: maxTime,
    percentages: { ...points[points.length - 1].percentages }
  };
  return result;
}

// Softens a uniformly-sampled series with a weighted moving average so the
// sharp corners left by linear interpolation melt into the flowing curves seen
// in stock apps (Robinhood / Webull / Yahoo Finance). The last point is kept
// exactly on the live totals so the line still ends on the real value.
function smoothSeriesValues(points, radius = 4) {
  if (points.length < 3) {
    return points;
  }

  const ids = Object.keys(points[points.length - 1].percentages);
  const lastReal = points[points.length - 1].percentages;

  const smoothed = points.map((point, i) => {
    const percentages = {};
    ids.forEach((id) => {
      let weightSum = 0;
      let valueSum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const j = i + k;
        if (j < 0 || j >= points.length) continue;
        // Triangular weights: closer samples count more for a gentle curve.
        const weight = radius + 1 - Math.abs(k);
        valueSum += (points[j].percentages[id] || 0) * weight;
        weightSum += weight;
      }
      percentages[id] = weightSum > 0 ? valueSum / weightSum : point.percentages[id] || 0;
    });
    return { time: point.time, percentages };
  });

  smoothed[smoothed.length - 1] = {
    time: points[points.length - 1].time,
    percentages: { ...lastReal }
  };
  return smoothed;
}

export default function TrendChart({ poll, options = [], snapshots = [], variant = 'full' }) {
  const { theme } = useTheme();
  const compact = variant === 'compact';
  const [range, setRange] = useState('1d');
  const [plotWidth, setPlotWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState(null);

  const plotHeight = compact ? 120 : 240;
  const activeRange = useMemo(
    () => TREND_RANGES.find((item) => item.id === range) || TREND_RANGES[0],
    [range]
  );

  // The trend only begins once the poll receives its first vote. Before that
  // there is nothing to plot, so the chart stays empty.
  const hasVotes = useMemo(() => {
    const total = Number(poll?.totalVotes ?? 0);
    if (total > 0) return true;
    return options.some((option) => Number(option.count ?? option.votes ?? 0) > 0);
  }, [poll?.totalVotes, options]);

  const chart = useMemo(() => {
    if (!options.length || plotWidth <= 0 || !hasVotes) {
      return null;
    }

    // Prefer real timestamped data; fall back to a simulated trend.
    const rawPoints =
      buildRealSeries(snapshots, options, activeRange.windowMs, poll) ||
      simulateTrendPoints(poll, options, activeRange.windowMs);
    if (rawPoints.length < 2) {
      return null;
    }

    // Resample onto a fixed grid of evenly spaced timestamps (stock-chart
    // style) so the line is dense and uniform, then it renders smoothly.
    const points = resampleSeries(rawPoints, 100);

    // A value-smoothed copy drives the drawn curve so it flows like a stock
    // app. The unsmoothed `points` still back the hover tooltip so readouts
    // reflect the actual vote share at that moment.
    const drawPoints = smoothSeriesValues(points, 4);

    const minTime = points[0].time;
    const maxTime = points[points.length - 1].time;
    const span = Math.max(1, maxTime - minTime);

    // Vertical scale. The full view always spans 0–100%. The compact card
    // zooms into the band where the values actually live so the movement is
    // easy to read at a glance.
    let yMin = 0;
    let yMax = 100;
    if (compact) {
      let lo = Infinity;
      let hi = -Infinity;
      drawPoints.forEach((point) => {
        options.forEach((option) => {
          const value = point.percentages[option.id] || 0;
          if (value < lo) lo = value;
          if (value > hi) hi = value;
        });
      });
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        const pad = Math.max(4, (hi - lo) * 0.18);
        yMin = Math.max(0, lo - pad);
        yMax = Math.min(100, hi + pad);
        if (yMax - yMin < 10) {
          const mid = (yMax + yMin) / 2;
          yMin = Math.max(0, mid - 5);
          yMax = Math.min(100, mid + 5);
        }
      }
    }
    const yRange = Math.max(1, yMax - yMin);

    const xFor = (time) => ((time - minTime) / span) * plotWidth;
    const yFor = (pct) => ((yMax - pct) / yRange) * plotHeight;

    const series = options.map((option, index) => {
      const color = option.color || CHART_PALETTE[index % CHART_PALETTE.length];
      const coords = drawPoints.map((point) => ({
        x: xFor(point.time),
        y: yFor(point.percentages[option.id] || 0)
      }));

      // Values are pre-smoothed, so a Catmull-Rom pass rounds the remaining
      // joins into one continuous, fluid stroke.
      const curve = smoothCoords(coords, 8);
      const segments = [];
      for (let i = 0; i < curve.length - 1; i += 1) {
        const a = curve[i];
        const b = curve[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 0.01) continue;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        segments.push({ left: a.x, top: a.y, width: length + 1, angle });
      }

      return {
        id: option.id,
        label: option.label,
        color,
        latestPct: points[points.length - 1].percentages[option.id] || 0,
        segments
      };
    });

    // Horizontal guide lines. Full view uses fixed 0/25/50/75/100 marks; the
    // focused compact view spreads marks across its zoomed band.
    const yGuideValues = compact
      ? [yMin, (yMin + yMax) / 2, yMax].map((value) => Math.round(value))
      : [0, 25, 50, 75, 100];
    const yGuides = [...new Set(yGuideValues)].map((pct) => ({ pct, y: yFor(pct) }));

    // Evenly spaced x-axis ticks across the visible time span. More ticks on
    // wider plots; each tick gets a vertical guide line plus a time label.
    const tickCount = compact ? 4 : Math.max(5, Math.min(9, Math.round(plotWidth / 90)));
    const ticks = [];
    for (let i = 0; i <= tickCount; i += 1) {
      const time = minTime + (span * i) / tickCount;
      ticks.push({ x: xFor(time), time });
    }
    const xGuides = ticks.map((tick) => ({ x: tick.x }));
    const xLabels = ticks.map((tick) => ({
      x: tick.x,
      text: formatAxisLabel(tick.time, activeRange.windowMs)
    }));

    // Per-timestamp data used by the hover tooltip. Dot positions follow the
    // drawn (smoothed) line; the percentage readout uses the actual vote share
    // at that timestamp so numbers stay truthful.
    const hoverPoints = points.map((point, pIdx) => ({
      x: xFor(point.time),
      time: point.time,
      values: options.map((option, index) => ({
        id: option.id,
        label: option.label,
        color: option.color || CHART_PALETTE[index % CHART_PALETTE.length],
        pct: point.percentages[option.id] || 0,
        y: yFor(drawPoints[pIdx].percentages[option.id] || 0)
      }))
    }));

    return { series, yGuides, xGuides, xLabels, hoverPoints };
  }, [poll, options, snapshots, activeRange, plotWidth, plotHeight, compact, hasVotes]);

  const hoverPoint = chart && hoverIdx != null ? chart.hoverPoints[hoverIdx] : null;

  const handleHover = (x) => {
    if (!chart || !chart.hoverPoints.length || plotWidth <= 0) {
      return;
    }
    const clamped = Math.max(0, Math.min(plotWidth, x));
    let nearest = 0;
    let best = Infinity;
    chart.hoverPoints.forEach((point, idx) => {
      const distance = Math.abs(point.x - clamped);
      if (distance < best) {
        best = distance;
        nearest = idx;
      }
    });
    setHoverIdx(nearest);
  };

  const clearHover = () => setHoverIdx(null);

  return (
    <View>
      {!compact && (
        <View style={styles.rangeRow}>
          {TREND_RANGES.map((item) => {
            const isActive = item.id === range;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => setRange(item.id)}
                style={[
                  styles.rangeButton,
                  {
                    backgroundColor: isActive ? theme.accent : 'transparent',
                    borderColor: isActive ? theme.accent : theme.border
                  }
                ]}
              >
                <Text style={[styles.rangeText, { color: isActive ? '#ffffff' : theme.subtext }]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View
        onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
        style={[
          styles.plot,
          {
            height: plotHeight,
            backgroundColor: compact ? 'transparent' : theme.surfaceMuted,
            borderColor: theme.border
          }
        ]}
      >
        {chart?.yGuides.map((guide, idx) => (
          <View key={`yg-${idx}`} style={[styles.guideLine, { top: guide.y, backgroundColor: theme.graphTrack }]} />
        ))}

        {chart?.yGuides.map((guide, idx) => (
          <Text
            key={`yl-${idx}`}
            style={[
              styles.yLabel,
              compact && styles.yLabelCompact,
              {
                top: Math.max(0, Math.min(plotHeight - 12, guide.y - 6)),
                color: theme.subtext,
                backgroundColor: compact ? 'transparent' : theme.surfaceMuted
              }
            ]}
          >
            {guide.pct}%
          </Text>
        ))}

        {chart?.xGuides.map((guide, idx) => (
          <View
            key={`xg-${idx}`}
            style={[styles.xGuideLine, { left: guide.x, backgroundColor: theme.graphTrack }]}
          />
        ))}

        {!chart && (
          <View pointerEvents="none" style={styles.emptyOverlay}>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>
              {hasVotes ? 'Building trend…' : 'No votes yet — the trend starts after the first vote.'}
            </Text>
          </View>
        )}

        {chart?.series.map((series) => (
          <View key={series.id} pointerEvents="none" style={StyleSheet.absoluteFill}>
            {series.segments.map((segment, idx) => {
              const thickness = compact ? 2.5 : 3;
              return (
                <View
                  key={`${series.id}-seg-${idx}`}
                  style={[
                    styles.segment,
                    {
                      left: segment.left,
                      top: segment.top - thickness / 2,
                      width: segment.width,
                      height: thickness,
                      borderRadius: thickness / 2,
                      backgroundColor: series.color,
                      transform: [{ rotateZ: `${segment.angle}deg` }]
                    }
                  ]}
                />
              );
            })}
          </View>
        ))}

        {hoverPoint && (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={[styles.hoverLine, { left: hoverPoint.x, backgroundColor: theme.accent }]} />
            {hoverPoint.values.map((value) => (
              <View
                key={`hover-${value.id}`}
                style={[
                  styles.hoverDot,
                  { left: hoverPoint.x - 4, top: value.y - 4, backgroundColor: value.color, borderColor: theme.surface }
                ]}
              />
            ))}
          </View>
        )}

        <View
          // Captures cursor/touch position to drive the tooltip. Web uses mouse
          // events; native uses the responder system.
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(event) => handleHover(event.nativeEvent.locationX)}
          onResponderMove={(event) => handleHover(event.nativeEvent.locationX)}
          onResponderRelease={clearHover}
          onMouseMove={(event) => handleHover(event.nativeEvent.offsetX)}
          onMouseLeave={clearHover}
        />

        {hoverPoint && (
          <View
            pointerEvents="none"
            style={[
              styles.tooltip,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                left: Math.max(6, Math.min(plotWidth - 150, hoverPoint.x - 75))
              }
            ]}
          >
            <Text style={[styles.tooltipTime, { color: theme.subtext }]}>
              {formatTooltipTime(hoverPoint.time)}
            </Text>
            {hoverPoint.values
              .slice()
              .sort((a, b) => b.pct - a.pct)
              .map((value) => (
                <View key={`tip-${value.id}`} style={styles.tooltipRow}>
                  <View style={[styles.tooltipSwatch, { backgroundColor: value.color }]} />
                  <Text style={[styles.tooltipLabel, { color: theme.text }]} numberOfLines={1}>{value.label}</Text>
                  <Text style={[styles.tooltipPct, { color: theme.text }]}>{value.pct.toFixed(0)}%</Text>
                </View>
              ))}
          </View>
        )}
      </View>

      {chart && (
        <View style={styles.xLabelsRow}>
          {chart.xLabels.map((label, idx) => (
            <Text
              key={`xl-${idx}`}
              numberOfLines={1}
              style={[
                styles.xLabel,
                compact && styles.xLabelCompact,
                { left: Math.max(0, Math.min(plotWidth - 60, label.x - 30)), color: theme.subtext }
              ]}
            >
              {label.text}
            </Text>
          ))}
        </View>
      )}

      <View style={[styles.legend, compact && styles.legendCompact]}>
        {(chart?.series || []).slice(0, compact ? 4 : 8).map((series) => (
          <View key={`${series.id}-legend`} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: series.color }]} />
            <Text style={[styles.legendText, { color: theme.subtext }]}>
              {series.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14
  },
  rangeButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1
  },
  rangeText: {
    fontSize: 12,
    fontWeight: '600'
  },
  plot: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative'
  },
  guideLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.7
  },
  xGuideLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    opacity: 0.4
  },
  yLabel: {
    position: 'absolute',
    left: 2,
    paddingHorizontal: 3,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: '700',
    opacity: 0.9
  },
  yLabelCompact: {
    fontSize: 9
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center'
  },
  segment: {
    position: 'absolute',
    borderRadius: 2,
    transformOrigin: '0 50%'
  },
  xLabelsRow: {
    height: 18,
    marginTop: 6,
    position: 'relative'
  },
  xLabel: {
    position: 'absolute',
    width: 60,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600'
  },
  xLabelCompact: {
    fontSize: 9
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12
  },
  legendCompact: {
    marginTop: 10,
    gap: 10
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1
  },
  hoverLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    opacity: 0.7
  },
  hoverDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5
  },
  tooltip: {
    position: 'absolute',
    top: 8,
    width: 150,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5
  },
  tooltipTime: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  tooltipSwatch: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  tooltipLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600'
  },
  tooltipPct: {
    fontSize: 11,
    fontWeight: '800'
  }
});
