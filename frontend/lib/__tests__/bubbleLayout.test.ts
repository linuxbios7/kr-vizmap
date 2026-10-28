import { describe, expect, it } from "vitest";
import type { BubbleResponse, BubbleStock, Period } from "../api";
import {
  bubblesToTree,
  computeBubbleLayout,
  formatMetric,
  hitBubble,
  logTicks,
  makeScale,
  metricValue,
  niceTicks,
} from "../bubbleLayout";

const chg = (v: number | null): Record<Period, number | null> => ({
  "1d": v,
  "1w": v === null ? null : v * 2,
  "1m": null,
  "3m": null,
  "6m": null,
  ytd: null,
  "1y": null,
});

const b = (
  code: string,
  sector: string,
  industry: string,
  cap: number,
  value: number,
  c: number | null,
): BubbleStock => ({
  code,
  name: code,
  market: "KOSPI",
  sector,
  industry,
  cap,
  price: 100,
  value,
  chg: chg(c),
});

const stocks = [
  b("A", "IT", "반도체", 1e15, 2e12, 2),
  b("B", "IT", "반도체", 2e14, 5e11, -1),
  b("C", "IT", "소프트웨어", 1e13, 1e10, 5),
  b("D", "금융", "은행", 5e13, 1e11, -3),
  b("E", "금융", "은행", 1e12, 0, 0), // 거래대금 0 → 로그축에서 제외
];

describe("metricValue", () => {
  it("지표별 값", () => {
    expect(metricValue(stocks[0], "chg", "1w")).toBe(4);
    expect(metricValue(stocks[0], "turnover", "1d")).toBeCloseTo(0.2);
    expect(metricValue(stocks[4], "value", "1d")).toBeNull();
    expect(metricValue(stocks[4], "turnover", "1d")).toBeNull();
  });
});

describe("scales", () => {
  it("등락률 축은 0을 포함하고 극단값은 가장자리로 잘린다", () => {
    const vals = [...Array.from({ length: 50 }, (_, i) => i / 10), 400];
    const s = makeScale(vals, "chg");
    expect(s.min).toBeLessThanOrEqual(0);
    expect(s.max).toBeLessThan(400);
    expect(s.norm(400)).toBe(1);
    expect(s.norm(0)).toBeGreaterThanOrEqual(0);
  });

  it("로그 축은 양수만 쓰고 10의 거듭제곱 눈금", () => {
    const s = makeScale([1e10, 1e12, 1e14, 0, -5], "value");
    expect(s.log).toBe(true);
    expect(s.ticks).toEqual(expect.arrayContaining([1e10, 1e11, 1e12, 1e13, 1e14]));
    expect(s.norm(1e12)).toBeCloseTo(0.5, 1);
  });

  it("눈금 계산", () => {
    expect(niceTicks(-3.2, 7.9)).toEqual([-2, 0, 2, 4, 6]);
    expect(logTicks(150, 900)).toEqual([200, 500]);
  });

  it("지표 표기", () => {
    expect(formatMetric(5, "chg")).toBe("+5%");
    expect(formatMetric(1e12, "value")).toBe("1조");
    expect(formatMetric(1e7, "value")).toBe("1,000만");
    expect(formatMetric(0.05, "turnover")).toBe("0.05%");
  });
});

describe("computeBubbleLayout", () => {
  const opts = {
    width: 900,
    height: 600,
    x: "value",
    y: "chg",
    period: "1d",
    group: "all",
  } as const;

  it("전체 보기: 패널 1개, 값 없는 종목 제외, 큰 버블 먼저 그린다", () => {
    const lay = computeBubbleLayout(stocks, opts);
    expect(lay.panels).toHaveLength(1);
    expect(lay.bubbles.map((v) => v.stock.code)).toEqual(["A", "B", "D", "C"]);
    const [a, , , c] = lay.bubbles;
    expect(a.r).toBeGreaterThan(c.r);
    // C는 등락률이 가장 높으니 가장 위(y가 작음), 거래대금이 가장 작으니 가장 왼쪽
    expect(Math.min(...lay.bubbles.map((v) => v.y))).toBe(c.y);
    expect(Math.min(...lay.bubbles.map((v) => v.x))).toBe(c.x);
    for (const v of lay.bubbles) {
      const p = lay.panels[v.panel].plot;
      expect(v.x).toBeGreaterThanOrEqual(p.x0);
      expect(v.x).toBeLessThanOrEqual(p.x1);
    }
  });

  it("섹터별 보기: 시총 큰 섹터부터 패널, 같은 축 범위 공유", () => {
    const lay = computeBubbleLayout(stocks, { ...opts, group: "sector" });
    expect(lay.panels.map((p) => p.name)).toEqual(["IT", "금융"]);
    expect(lay.panels[1].path).toEqual(["금융"]);
    expect(lay.bubbles.find((v) => v.stock.code === "D")!.panel).toBe(1);
  });

  it("클릭 위치의 버블 찾기", () => {
    const lay = computeBubbleLayout(stocks, opts);
    const c = lay.bubbles.find((v) => v.stock.code === "C")!;
    expect(hitBubble(lay, c.x, c.y)!.stock.code).toBe("C");
    expect(hitBubble(lay, -100, -100)).toBeNull();
  });
});

describe("bubblesToTree", () => {
  it("섹터/업종/종목 트리, 등락률은 선택 기간", () => {
    const resp: BubbleResponse = {
      asof: null,
      market: "KOSPI",
      base_dates: chg(null) as unknown as BubbleResponse["base_dates"],
      stocks,
    };
    const tree = bubblesToTree(resp, "1w");
    expect(tree.children.map((c) => c.name)).toEqual(["IT", "금융"]);
    const semi = (tree.children[0] as { children: { name: string; children: { chg: number }[] }[] })
      .children[0];
    expect(semi.name).toBe("반도체");
    expect(semi.children[0].chg).toBe(4);
  });
});
