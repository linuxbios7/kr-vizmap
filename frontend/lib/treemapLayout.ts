import { hierarchy, treemap, treemapSquarify, type HierarchyNode } from "d3-hierarchy";
import type { MapNode, StockLeaf } from "./api";

export type Datum = MapNode | StockLeaf;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LeafRect extends Rect {
  stock: StockLeaf;
  sector: string;
  industry: string;
  /** 같은 업종 종목(시총 내림차순) — 툴팁용 */
  peers: StockLeaf[];
}

export interface GroupRect extends Rect {
  name: string;
  /** 전체 맵 기준 깊이: 1=섹터, 2=업종 */
  depth: 1 | 2;
  /** 전체 맵 루트부터의 이름 경로(줌 대상 지정용) */
  path: string[];
}

export interface Layout {
  width: number;
  height: number;
  leaves: LeafRect[];
  groups: GroupRect[];
}

export const SECTOR_HEADER = 18;
export const INDUSTRY_HEADER = 13;

export function isLeaf(d: Datum): d is StockLeaf {
  return "code" in d;
}

/** path(섹터명, 업종명)를 따라 내려간 하위 트리. 없으면 null. */
export function findNode(root: MapNode, path: string[]): MapNode | null {
  let node: MapNode = root;
  for (const name of path) {
    const next = node.children.find((c) => !isLeaf(c) && c.name === name);
    if (!next || isLeaf(next)) return null;
    node = next;
  }
  return node;
}

/**
 * 트리맵 레이아웃 계산. root는 basePath가 가리키는 하위 트리(줌 상태)이며,
 * 면적은 시가총액에 비례한다.
 */
export function computeLayout(
  root: MapNode,
  width: number,
  height: number,
  basePath: string[] = [],
): Layout {
  const baseDepth = basePath.length;
  const absDepth = (n: HierarchyNode<Datum>) => baseDepth + n.depth;
  const header = (n: HierarchyNode<Datum>) => {
    if (n.depth === 0) return 0;
    const d = absDepth(n);
    return d === 1 ? SECTOR_HEADER : d === 2 ? INDUSTRY_HEADER : 0;
  };

  const h = hierarchy<Datum>(root, (d) => (isLeaf(d) ? null : d.children))
    .sum((d) => (isLeaf(d) ? Math.max(d.cap, 0) : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const laid = treemap<Datum>()
    .tile(treemapSquarify)
    .size([width, height])
    .paddingInner((n) => (absDepth(n) === 0 ? 3 : 1))
    .paddingOuter((n) => (n.depth === 0 || isLeaf(n.data) ? 0 : 1))
    .paddingTop(header)
    .round(false)(h);

  const leaves: LeafRect[] = [];
  const groups: GroupRect[] = [];
  for (const n of laid.descendants()) {
    if (n.x1 - n.x0 <= 0 || n.y1 - n.y0 <= 0) continue;
    const names = n
      .ancestors()
      .reverse()
      .slice(1)
      .map((a) => (a.data as MapNode).name);
    const fullPath = [...basePath, ...names];
    const rect = { x0: n.x0, y0: n.y0, x1: n.x1, y1: n.y1 };
    if (isLeaf(n.data)) {
      const parent = n.parent!;
      leaves.push({
        ...rect,
        stock: n.data,
        sector: fullPath[0] ?? "",
        industry: fullPath[1] ?? "",
        peers: (parent.children ?? []).map((c) => c.data as StockLeaf),
      });
    } else if (n.depth > 0) {
      const d = absDepth(n);
      if (d === 1 || d === 2) groups.push({ ...rect, name: n.data.name, depth: d, path: fullPath });
    }
  }
  return { width, height, leaves, groups };
}

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
}

export function headerHeight(g: GroupRect): number {
  return g.depth === 1 ? SECTOR_HEADER : INDUSTRY_HEADER;
}
