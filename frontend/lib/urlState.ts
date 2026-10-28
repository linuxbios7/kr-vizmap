import type { Market, Period } from "./api";
import type { BubbleGroup, BubbleMetric } from "./bubbleLayout";
import type { ColorMode } from "./colorScale";

export type View = "map" | "bubble";

export interface MapState {
  market: Market;
  period: Period;
  colorMode: ColorMode;
  /** 줌 경로 [섹터, 업종] */
  path: string[];
  /** 검색으로 강조한 종목코드 */
  highlight: string | null;
  view: View;
  /** 버블 차트 X·Y축 지표와 묶음 방식 */
  bx: BubbleMetric;
  by: BubbleMetric;
  bg: BubbleGroup;
}

export const DEFAULT_STATE: MapState = {
  market: "KOSPI",
  period: "1d",
  colorMode: "kr",
  path: [],
  highlight: null,
  view: "map",
  bx: "value",
  by: "chg",
  bg: "all",
};

const MARKETS: Market[] = ["KOSPI", "KOSDAQ", "ALL"];
const PERIODS: Period[] = ["1d", "1w", "1m", "3m", "6m", "ytd", "1y"];
const METRICS: BubbleMetric[] = ["chg", "cap", "value", "turnover"];

function pick<T extends string>(v: string | null, allowed: T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/** ?m=KOSDAQ&p=1w&c=us&z=IT&s=005930&v=bubble&bx=cap&by=chg&bg=sector → MapState (잘못된 값은 기본값) */
export function parseState(params: URLSearchParams): MapState {
  const code = params.get("s");
  return {
    market: pick(params.get("m"), MARKETS, DEFAULT_STATE.market),
    period: pick(params.get("p"), PERIODS, DEFAULT_STATE.period),
    colorMode: pick(params.get("c"), ["kr", "us"], DEFAULT_STATE.colorMode),
    path: params.getAll("z").filter(Boolean).slice(0, 2),
    highlight: code && /^\w{6}$/.test(code) ? code : null,
    view: pick(params.get("v"), ["map", "bubble"], DEFAULT_STATE.view),
    bx: pick(params.get("bx"), METRICS, DEFAULT_STATE.bx),
    by: pick(params.get("by"), METRICS, DEFAULT_STATE.by),
    bg: pick(params.get("bg"), ["all", "sector"], DEFAULT_STATE.bg),
  };
}

/** 기본값은 생략해 짧은 URL을 만든다. */
export function serializeState(s: MapState): string {
  const p = new URLSearchParams();
  if (s.market !== DEFAULT_STATE.market) p.set("m", s.market);
  if (s.period !== DEFAULT_STATE.period) p.set("p", s.period);
  if (s.colorMode !== DEFAULT_STATE.colorMode) p.set("c", s.colorMode);
  for (const z of s.path) p.append("z", z);
  if (s.highlight) p.set("s", s.highlight);
  if (s.view !== DEFAULT_STATE.view) p.set("v", s.view);
  if (s.view === "bubble") {
    if (s.bx !== DEFAULT_STATE.bx) p.set("bx", s.bx);
    if (s.by !== DEFAULT_STATE.by) p.set("by", s.by);
    if (s.bg !== DEFAULT_STATE.bg) p.set("bg", s.bg);
  }
  return p.toString();
}
