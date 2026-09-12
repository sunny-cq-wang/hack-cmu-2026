/**
 * Weigh-in trend chart (pet or human).
 *
 * Pure presentation: every number it draws is handed to it by the API
 * (AGENTS.md §4.3 — the app never computes targets or trends). It only maps
 * kilograms and timestamps onto pixels.
 *
 * Drawn with `react-native-svg` (the same dependency `features/home/ScoreRing.tsx`
 * uses) — no victory-native, no skia.
 */
import { useId, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import type { Trend, WeighIn } from '@petplate/shared';

import { colors } from './theme';

const CHART_HEIGHT = 176;
const PAD_TOP = 22;
const PAD_BOTTOM = 20;
const PAD_X = 14;
const Y_AXIS_WIDTH = 44;
const AXIS_LINE_HEIGHT = 14;
/** Catmull-Rom tension; below 1 keeps the curve from overshooting a spiky series. */
const SMOOTHING = 0.8;
/** Smallest kg range we ever scale to, so a flat series is not a divide-by-zero. */
const MIN_SPAN_KG = 0.4;
/** Plot the newest N points so a fresh weigh-in actually moves the line. */
const RECENT_POINTS = 8;
/** Pull the ideal line into the axis only when it sits this close to the data. */
const IDEAL_INCLUDE_KG = 0.8;

const DEFAULT_EMPTY_COPY = 'Add a weigh-in weekly and PetPlate will tune the portion automatically.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

interface SeriesPoint {
  at: string;
  kg: number;
}

interface PlotPoint {
  x: number;
  y: number;
  kg: number;
  at: string;
}

export interface WeightChartProps {
  /** `TrendSchema` from the `/weighins` response. */
  trend: Trend | undefined;
  /** Ideal (pet) or target (human) weight — drawn as the dashed reference line. */
  idealWeightKg: number;
  /**
   * Raw weigh-ins from the same response. `trend.points` is clipped to the
   * adaptive window (`WEIGHIN_WINDOW_DAYS` = 14 days), so the raw list is
   * usually the longer, better-looking series; whichever has more points wins.
   */
  weighIns?: readonly WeighIn[] | undefined;
  caption?: string | undefined;
  /** Word in front of the reference-line value: "Ideal 12 kg" / "Target 75 kg". */
  idealLabel?: string;
  /** Line/fill colour. Defaults to the app accent; pass another to tell two charts apart. */
  tint?: string;
  emptyCopy?: string;
  accessibilityLabel?: string;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()] ?? ''} ${d.getDate()}`;
}

/** Prefer the raw weigh-ins, fall back to `trend.points`. Always oldest to newest. */
function buildSeries(trend: Trend | undefined, weighIns: readonly WeighIn[] | undefined): SeriesPoint[] {
  const fromWeighIns: SeriesPoint[] = (weighIns ?? []).map((w) => ({ at: w.weighedAt, kg: w.weightKg }));
  const fromTrend: SeriesPoint[] = trend?.points ?? [];
  const source = fromWeighIns.length > fromTrend.length ? fromWeighIns : fromTrend;
  const all = source
    .filter((p) => Number.isFinite(p.kg) && !Number.isNaN(Date.parse(p.at)))
    .slice()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return all.length > RECENT_POINTS ? all.slice(-RECENT_POINTS) : all;
}

/** Catmull-Rom to cubic Bezier, so the line curves through every point it owns. */
function smoothPath(points: readonly { x: number; y: number }[]): string {
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) return `M ${first.x} ${first.y}`;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i] ?? first;
    const p2 = points[i + 1] ?? p1;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * SMOOTHING;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * SMOOTHING;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * SMOOTHING;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * SMOOTHING;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function WeightChart(props: WeightChartProps): React.JSX.Element {
  const { trend, idealWeightKg, weighIns, caption, tint = colors.accent } = props;
  const idealLabel = props.idealLabel ?? 'Ideal';
  const emptyCopy = props.emptyCopy ?? DEFAULT_EMPTY_COPY;

  // <Defs> ids are shared across every SVG on screen, so two charts on one page
  // would fight over a single gradient id without this.
  const rawId = useId();
  const gradientId = `wc${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [plotWidth, setPlotWidth] = useState(() =>
    Math.max(160, Dimensions.get('window').width - 40 - Y_AXIS_WIDTH - 16),
  );

  const series = useMemo(() => buildSeries(trend, weighIns), [trend, weighIns]);

  const geometry = useMemo(() => {
    if (series.length === 0) return null;
    const kgs = series.map((p) => p.kg);
    const dataLo = Math.min(...kgs);
    const dataHi = Math.max(...kgs);
    const dataSpan = dataHi - dataLo;
    const pad = Math.max(0.12, dataSpan * 0.25);
    let yMin = dataLo - pad;
    let yMax = dataHi + pad;
    // Keep the ideal line on-plot when it is near the series. Stretching all the
    // way to a far-away ideal (12 kg vs 14–15 kg of seed history) flattened new
    // weigh-ins into a 2 px wiggle.
    if (Math.abs(idealWeightKg - dataLo) <= IDEAL_INCLUDE_KG || Math.abs(idealWeightKg - dataHi) <= IDEAL_INCLUDE_KG) {
      yMin = Math.min(yMin, idealWeightKg - 0.1);
      yMax = Math.max(yMax, idealWeightKg + 0.1);
    }
    if (yMax - yMin < MIN_SPAN_KG) {
      const mid = (yMin + yMax) / 2;
      yMin = mid - MIN_SPAN_KG / 2;
      yMax = mid + MIN_SPAN_KG / 2;
    }

    const innerW = Math.max(1, plotWidth - PAD_X * 2);
    const innerH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
    const lastIndex = series.length - 1;
    const toY = (kg: number): number => PAD_TOP + ((yMax - kg) / (yMax - yMin)) * innerH;
    const toX = (i: number): number =>
      lastIndex === 0 ? PAD_X + innerW / 2 : PAD_X + (i / lastIndex) * innerW;

    const markers: PlotPoint[] = series.map((p, i) => ({ x: toX(i), y: toY(p.kg), kg: p.kg, at: p.at }));
    const head = markers[0];
    const tail = markers[markers.length - 1];
    if (!head || !tail) return null;

    // A single weigh-in still deserves a line: stretch it flat across the plot.
    const strokePoints =
      markers.length === 1 ? [{ x: PAD_X, y: head.y }, { x: PAD_X + innerW, y: head.y }] : markers;
    const linePath = smoothPath(strokePoints);
    const baseY = CHART_HEIGHT - PAD_BOTTOM + 8;
    const areaStart = strokePoints[0] ?? head;
    const areaEnd = strokePoints[strokePoints.length - 1] ?? tail;
    const areaPath = `${linePath} L ${areaEnd.x} ${baseY} L ${areaStart.x} ${baseY} Z`;

    const idealInRange = idealWeightKg >= yMin && idealWeightKg <= yMax;
    const idealY = toY(Math.min(yMax, Math.max(yMin, idealWeightKg)));
    return {
      markers,
      first: head,
      last: tail,
      linePath,
      areaPath,
      idealY,
      idealInRange,
      idealAbove: idealY < PAD_TOP + AXIS_LINE_HEIGHT,
      yMin,
      yMax,
    };
  }, [series, idealWeightKg, plotWidth]);

  const onLayout = (e: LayoutChangeEvent): void => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== plotWidth) setPlotWidth(w);
  };

  if (!geometry) {
    return <Text style={styles.empty}>{emptyCopy}</Text>;
  }

  const { markers, first, last, linePath, areaPath, idealY, idealInRange, idealAbove, yMin, yMax } = geometry;
  const valueLabelY = last.y - 14 < AXIS_LINE_HEIGHT ? last.y + 22 : last.y - 14;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        props.accessibilityLabel ??
        `Weight trend: ${markers.length} weigh-ins, latest ${last.kg.toFixed(1)} kg, ${idealLabel.toLowerCase()} ${idealWeightKg} kg.`
      }
    >
      <View style={styles.chartCard}>
        <View style={styles.yAxis}>
          <Text style={styles.axisText}>{yMax.toFixed(1)}</Text>
          <Text style={styles.axisText}>{yMin.toFixed(1)}</Text>
        </View>
        <View style={styles.plot} onLayout={onLayout}>
          <Svg width={plotWidth} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={tint} stopOpacity="0.36" />
                <Stop offset="1" stopColor={tint} stopOpacity="0.02" />
              </LinearGradient>
            </Defs>

            <Path d={areaPath} fill={`url(#${gradientId})`} />

            {idealInRange ? (
              <>
                <Line
                  x1={PAD_X}
                  y1={idealY}
                  x2={plotWidth - PAD_X}
                  y2={idealY}
                  stroke={colors.thriving}
                  strokeWidth={1.5}
                  strokeDasharray="6 5"
                  opacity={0.9}
                />
                <SvgText
                  x={PAD_X}
                  y={idealAbove ? idealY + 14 : idealY - 6}
                  fill={colors.thriving}
                  fontSize={11}
                  fontWeight="600"
                >
                  {`${idealLabel} ${idealWeightKg} kg`}
                </SvgText>
              </>
            ) : null}

            <Path
              d={linePath}
              stroke={tint}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            {markers.map((p, i) => {
              const newest = i === markers.length - 1;
              return (
                <G key={`${p.at}-${i}`}>
                  {newest ? <Circle cx={p.x} cy={p.y} r={10} fill={tint} opacity={0.22} /> : null}
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={newest ? 5 : 3.2}
                    fill={newest ? tint : colors.card}
                    stroke={tint}
                    strokeWidth={newest ? 2 : 1.6}
                  />
                </G>
              );
            })}

            <SvgText x={last.x} y={valueLabelY} fill={colors.text} fontSize={12} fontWeight="700" textAnchor="end">
              {`${last.kg.toFixed(1)} kg`}
            </SvgText>
          </Svg>
        </View>
      </View>

      <View style={styles.xAxis}>
        <Text style={styles.axisText}>{formatShortDate(first.at)}</Text>
        <Text style={styles.axisText}>{formatShortDate(last.at)}</Text>
      </View>

      <Text style={styles.latest}>{`Latest ${last.kg.toFixed(1)} kg`}</Text>
      {!idealInRange ? (
        <Text style={styles.caption}>{`${idealLabel} ${idealWeightKg} kg is outside this zoom`}</Text>
      ) : null}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  chartCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingRight: 8,
    overflow: 'hidden',
  },
  yAxis: {
    width: Y_AXIS_WIDTH,
    height: CHART_HEIGHT,
    paddingLeft: 12,
    paddingTop: PAD_TOP - AXIS_LINE_HEIGHT / 2,
    paddingBottom: PAD_BOTTOM - AXIS_LINE_HEIGHT / 2,
    justifyContent: 'space-between',
  },
  plot: { flex: 1, height: CHART_HEIGHT },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: Y_AXIS_WIDTH,
    paddingRight: 8,
  },
  axisText: { color: colors.muted, fontSize: 11, lineHeight: AXIS_LINE_HEIGHT },
  caption: { color: colors.muted, fontSize: 13 },
  latest: { color: colors.text, fontSize: 15, fontWeight: '700' },
  empty: { color: colors.muted, fontSize: 14 },
});
