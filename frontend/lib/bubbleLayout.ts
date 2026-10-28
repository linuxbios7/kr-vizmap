import type { BubbleResponse, BubbleStock, MapNode, Period, StockLeaf } from "./api";
import { formatCap } from "./format";

export type BubbleMetric = "chg" | "cap" | "value" | "turnover";
export type BubbleGroup = "all" | "sector";

export const METRICS: { value: BubbleMetric; label: string }[] = [
  { value: "chg", label: "등락률" },
  { value: "cap", label: "시가총액" },
  { value: "value", label: "거래대금" },
  { value: "turnover", label: "회전율" },
];

/** 로그 축을 쓰는 지표(분포가 수십~수만 배로 퍼짐) */
const LOG: Record<BubbleMetric, boolean> = { chg: false, cap: true, value: true, turnover: true };

export function metricValue(s: BubbleStock, m: BubbleMetric, period: Period): number | null {
  switch (m) {
    case "chg":
      return s.chg[period];
    case "cap":
      return s.cap > 0 ? s.cap : null;
    case "value":
      return s.value > 0 ? s.value : null;
    case "turnover":
      return s.value > 0 && s.cap > 0 ? (s.value / s.cap) * 100 : null;
  }
}

export function formatMetric(v: number, m: BubbleMetric): string {
  if (m === "chg") return `${v > 0 ? "+" : ""}${Number.isInteger(v) ? v : v.toFixed(1)}%`;
  if (m === "turnover") return `${v >= 1 ? +v.toFixed(1) : +v.toPrecision(1)}%`;
  // 1억 미만은 만원 단위 (거래대금이 작은 종목)
  return v < 1e8
    ? `${(v / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만`
    : formatCap(v);
}

// ---------- scales ----------

export interface Scale {
  log: boolean;
  min: number;
  max: number;
  ticks: number[];
  /** 값 → 0..1 (범위 밖은 잘라냄) */
  norm: (v: number) => number;
}

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  // d3-array ticks와 같은 방식: 1·2·5·10 배수 중 개수가 count에 가장 가깝게
  const raw = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const ratio = raw / mag;
  const step =
    (ratio >= Math.sqrt(50) ? 10 : ratio >= Math.sqrt(10) ? 5 : ratio >= Math.SQRT2 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
    ticks.push(Math.abs(t) < 1e-9 ? 0 : +t.toPrecision(12));
  }
  return ticks;
}

export function logTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    const t = Math.pow(10, e);
    if (t >= min && t <= max) ticks.push(t);
  }
  if (ticks.length < 3) {
    // 범위가 좁으면 2·5 배수도 넣는다
    const more: number[] = [];
    for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++)
      for (const k of [1, 2, 5]) {
        const t = k * Math.pow(10, e);
        if (t >= min && t <= max) more.push(t);
      }
    return more;
  }
  return ticks;
}

/**
 * 값 분포로 축 범위를 정한다. 선형 축은 극단값 때문에 대부분이 뭉치지 않도록
 * 2~98 백분위로 자르고(밖은 가장자리에 표시), 등락률은 0을 포함한다.
 */
export function makeScale(values: number[], metric: BubbleMetric): Scale {
  const log = LOG[metric];
  const vs = values.filter((v) => Number.isFinite(v) && (!log || v > 0)).sort((a, b) => a - b);
  if (!vs.length) return makeScale(log ? [1, 10] : [-1, 1], metric);

  if (log) {
    let lmin = Math.log10(vs[0]);
    let lmax = Math.log10(vs[vs.length - 1]);
    if (lmax - lmin < 0.5) [lmin, lmax] = [lmin - 0.25, lmax + 0.25];
    const pad = (lmax - lmin) * 0.05;
    const [a, b] = [lmin - pad, lmax + pad];
    const min = Math.pow(10, a);
    const max = Math.pow(10, b);
    return {
      log,
      min,
      max,
      ticks: logTicks(min, max),
      norm: (v) => Math.min(1, Math.max(0, (Math.log10(Math.max(v, min)) - a) / (b - a))),
    };
  }

  let lo = vs.length > 20 ? quantile(vs, 0.02) : vs[0];
  let hi = vs.length > 20 ? quantile(vs, 0.98) : vs[vs.length - 1];
  if (metric === "chg") [lo, hi] = [Math.min(lo, 0), Math.max(hi, 0)];
  if (hi - lo < 1e-9) [lo, hi] = [lo - 1, hi + 1];
  const pad = (hi - lo) * 0.06;
  const [min, max] = [lo - pad, hi + pad];
  return {
    log,
    min,
    max,
    ticks: niceTicks(min, max),
    norm: (v) => Math.min(1, Math.max(0, (v - min) / (max - min))),
  };
}

// ---------- layout ----------

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Panel extends Box {
  name: string;
  /** 줌 경로 (섹터별 보기에서만) */
  path: string[];
  plot: Box;
}

export interface Bubble {
  stock: BubbleStock;
  x: number;
  y: number;
  r: number;
  panel: number;
}

export interface BubbleLayout {
  width: number;
  height: number;
  panels: Panel[];
  bubbles: Bubble[];
  /** 그리기 순서: 큰 버블 먼저(작은 것이 위에 보이게) */
  xScale: Scale;
  yScale: Scale;
}

export const PANEL_TITLE = 18;
const AXIS_LEFT = 46;
const AXIS_BOTTOM = 18;

interface LayoutOptions {
  width: number;
  height: number;
  x: BubbleMetric;
  y: BubbleMetric;
  period: Period;
  group: BubbleGroup;
}

function gridDims(n: number, w: number, h: number): [number, number] {
  let best: [number, number] = [n, 1];
  let bestScore = Infinity;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const aspect = w / cols / (h / rows);
    const score = Math.abs(Math.log(aspect / 1.4)) + (cols * rows - n) * 0.15;
    if (score < bestScore) [best, bestScore] = [[cols, rows], score];
  }
  return best;
}

export function computeBubbleLayout(stocks: BubbleStock[], o: LayoutOptions): BubbleLayout {
  const pts = stocks
    .map((s) => ({ s, xv: metricValue(s, o.x, o.period), yv: metricValue(s, o.y, o.period) }))
    .filter((p): p is { s: BubbleStock; xv: number; yv: number } => p.xv !== null && p.yv !== null);

  const xScale = makeScale(
    pts.map((p) => p.xv),
    o.x,
  );
  const yScale = makeScale(
    pts.map((p) => p.yv),
    o.y,
  );

  // 패널: 전체 1개, 섹터별은 시총 큰 섹터부터 격자
  let groups: { name: string; items: typeof pts }[];
  if (o.group === "sector") {
    const by = new Map<string, typeof pts>();
    for (const p of pts) by.set(p.s.sector, [...(by.get(p.s.sector) ?? []), p]);
    const cap = (items: typeof pts) => items.reduce((a, p) => a + p.s.cap, 0);
    groups = [...by.entries()]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => cap(b.items) - cap(a.items));
  } else {
    groups = [{ name: "", items: pts }];
  }

  const [cols, rows] = gridDims(Math.max(1, groups.length), o.width, o.height);
  const gap = groups.length > 1 ? 6 : 0;
  const pw = (o.width - gap * (cols - 1)) / cols;
  const ph = (o.height - gap * (rows - 1)) / rows;
  const maxCap = Math.max(1, ...pts.map((p) => p.s.cap));

  const panels: Panel[] = [];
  const bubbles: Bubble[] = [];
  groups.forEach((g, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x0 = c * (pw + gap);
    const y0 = r * (ph + gap);
    const title = o.group === "sector" ? PANEL_TITLE : 0;
    const plot = {
      x0: x0 + AXIS_LEFT,
      y0: y0 + title + 6,
      x1: x0 + pw - 8,
      y1: y0 + ph - AXIS_BOTTOM,
    };
    panels.push({
      name: g.name,
      path: o.group === "sector" ? [g.name] : [],
      x0,
      y0,
      x1: x0 + pw,
      y1: y0 + ph,
      plot,
    });
    const pwid = Math.max(1, plot.x1 - plot.x0);
    const phei = Math.max(1, plot.y1 - plot.y0);
    const rMax = Math.max(6, Math.min(pwid, phei) * (groups.length > 1 ? 0.12 : 0.07));
    for (const p of g.items) {
      bubbles.push({
        stock: p.s,
        x: plot.x0 + xScale.norm(p.xv) * pwid,
        y: plot.y1 - yScale.norm(p.yv) * phei,
        r: Math.max(1.5, rMax * Math.sqrt(p.s.cap / maxCap)),
        panel: i,
      });
    }
  });
  bubbles.sort((a, b) => b.r - a.r);
  return { width: o.width, height: o.height, panels, bubbles, xScale, yScale };
}

/** 점에 걸리는 버블 중 맨 위(가장 작은 것) */
export function hitBubble(layout: BubbleLayout, x: number, y: number): Bubble | null {
  for (let i = layout.bubbles.length - 1; i >= 0; i--) {
    const b = layout.bubbles[i];
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= Math.max(b.r, 4)) return b;
  }
  return null;
}

// ---------- tree (검색·툴팁·모바일 추리기 재사용) ----------

/** 버블 목록 → 맵과 같은 섹터/업종/종목 트리 (등락률은 선택 기간) */
export function bubblesToTree(resp: BubbleResponse, period: Period): MapNode {
  const sectors = new Map<string, Map<string, StockLeaf[]>>();
  for (const s of resp.stocks) {
    const inds = sectors.get(s.sector) ?? new Map<string, StockLeaf[]>();
    sectors.set(s.sector, inds);
    const leaves = inds.get(s.industry) ?? [];
    inds.set(s.industry, leaves);
    leaves.push({
      code: s.code,
      name: s.name,
      market: s.market,
      cap: s.cap,
      chg: s.chg[period],
      price: s.price,
    });
  }
  return {
    name: resp.market,
    children: [...sectors.entries()].map(([name, inds]) => ({
      name,
      children: [...inds.entries()].map(([iname, leaves]) => ({ name: iname, children: leaves })),
    })),
  };
}
