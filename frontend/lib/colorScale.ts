import type { Period } from "./api";

export type ColorMode = "kr" | "us";
type RGB = [number, number, number];

const NEUTRAL: RGB = [65, 69, 84];
const RED: RGB[] = [
  [139, 68, 78],
  [191, 64, 69],
  [246, 53, 56],
];
const GREEN: RGB[] = [
  [53, 118, 78],
  [47, 158, 79],
  [48, 204, 90],
];
const BLUE: RGB[] = [
  [62, 80, 130],
  [52, 94, 180],
  [44, 112, 230],
];

export const NO_DATA_COLOR = "#2b2d35";

/** 색 스케일 끝값(±%). 기간이 길수록 넓힌다. */
export const PERIOD_RANGE: Record<Period, number> = {
  "1d": 3,
  "1w": 6,
  "1m": 10,
  "3m": 15,
  "6m": 20,
  ytd: 30,
  "1y": 30,
};

function palette(mode: ColorMode): { up: RGB[]; down: RGB[] } {
  return mode === "kr" ? { up: RED, down: BLUE } : { up: GREEN, down: RED };
}

function mix(a: RGB, b: RGB, f: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** 등락률 → 색. ±range를 3단계로 나눠 단계 사이는 선형 보간, 범위 밖은 끝색. */
export function colorFor(chg: number | null, mode: ColorMode, range: number): string {
  if (chg === null || Number.isNaN(chg)) return NO_DATA_COLOR;
  const t = Math.max(-3, Math.min(3, (chg / range) * 3));
  const side = t >= 0 ? palette(mode).up : palette(mode).down;
  const a = Math.abs(t);
  const i = Math.floor(a);
  if (i >= 3) return mix(side[2], side[2], 0);
  const from = i === 0 ? NEUTRAL : side[i - 1];
  return mix(from, side[i], a - i);
}

/** 범례 눈금: -range … +range 7개 */
export function legendStops(range: number): number[] {
  return [-3, -2, -1, 0, 1, 2, 3].map((k) => (k * range) / 3);
}
