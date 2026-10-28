import { describe, expect, it } from "vitest";
import type { MapNode, StockLeaf } from "../api";
import {
  computeLayout,
  findNode,
  INDUSTRY_HEADER,
  SECTOR_HEADER,
  type Rect,
} from "../treemapLayout";

const stock = (code: string, cap: number, chg = 0): StockLeaf => ({
  code,
  name: code,
  market: "KOSPI",
  cap,
  chg,
  price: 1000,
});

const tree: MapNode = {
  name: "KOSPI",
  children: [
    {
      name: "IT",
      children: [
        { name: "반도체", children: [stock("A", 600), stock("B", 300), stock("C", 100)] },
        { name: "소프트웨어", children: [stock("D", 200)] },
      ],
    },
    { name: "금융", children: [{ name: "은행", children: [stock("E", 400), stock("F", 100)] }] },
  ],
};

const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
const overlap = (a: Rect, b: Rect) =>
  a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;

describe("computeLayout", () => {
  const lay = computeLayout(tree, 1000, 600);

  it("모든 종목이 화면 안에 있고 서로 겹치지 않는다", () => {
    expect(lay.leaves).toHaveLength(6);
    for (const l of lay.leaves) {
      expect(l.x0).toBeGreaterThanOrEqual(0);
      expect(l.y0).toBeGreaterThanOrEqual(0);
      expect(l.x1).toBeLessThanOrEqual(1000);
      expect(l.y1).toBeLessThanOrEqual(600);
    }
    for (let i = 0; i < lay.leaves.length; i++)
      for (let j = i + 1; j < lay.leaves.length; j++)
        expect(overlap(lay.leaves[i], lay.leaves[j])).toBe(false);
  });

  it("같은 업종 안에서 면적 비율 = 시가총액 비율", () => {
    const byCode = Object.fromEntries(lay.leaves.map((l) => [l.stock.code, l]));
    const total = area(byCode.A) + area(byCode.B) + area(byCode.C);
    expect(area(byCode.A) / total).toBeCloseTo(0.6, 1);
    expect(area(byCode.B) / total).toBeCloseTo(0.3, 1);
    expect(area(byCode.E) / (area(byCode.E) + area(byCode.F))).toBeCloseTo(0.8, 1);
  });

  it("섹터·업종 그룹과 헤더 영역을 만든다", () => {
    const sectors = lay.groups.filter((g) => g.depth === 1).map((g) => g.name);
    expect(sectors).toEqual(["IT", "금융"]); // 시총 큰 순
    const semi = lay.groups.find((g) => g.name === "반도체")!;
    expect(semi.path).toEqual(["IT", "반도체"]);
    const a = lay.leaves.find((l) => l.stock.code === "A")!;
    expect(a.y0).toBeGreaterThanOrEqual(semi.y0 + INDUSTRY_HEADER);
    const it = lay.groups.find((g) => g.name === "IT")!;
    expect(semi.y0).toBeGreaterThanOrEqual(it.y0 + SECTOR_HEADER);
    expect(a.sector).toBe("IT");
    expect(a.industry).toBe("반도체");
    expect(a.peers.map((p) => p.code)).toEqual(["A", "B", "C"]);
  });

  it("줌(섹터 루트)에서는 경로가 유지되고 섹터 헤더가 없다", () => {
    const it = findNode(tree, ["IT"])!;
    const z = computeLayout(it, 800, 400, ["IT"]);
    expect(z.groups.every((g) => g.depth === 2)).toBe(true);
    expect(z.groups.map((g) => g.path)).toContainEqual(["IT", "반도체"]);
    expect(z.leaves.find((l) => l.stock.code === "A")!.sector).toBe("IT");
  });
});

describe("findNode", () => {
  it("경로를 따라 하위 트리를 찾는다", () => {
    expect(findNode(tree, [])).toBe(tree);
    expect(findNode(tree, ["금융", "은행"])!.children).toHaveLength(2);
    expect(findNode(tree, ["없음"])).toBeNull();
  });
});
