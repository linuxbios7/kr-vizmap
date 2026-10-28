import type { MapNode, StockLeaf } from "./api";
import { isLeaf } from "./treemapLayout";

export interface StockHit {
  stock: StockLeaf;
  /** [섹터, 업종] */
  path: string[];
}

export function allStocks(root: MapNode): StockHit[] {
  const out: StockHit[] = [];
  const walk = (node: MapNode, path: string[]) => {
    for (const c of node.children) {
      if (isLeaf(c)) out.push({ stock: c, path });
      else walk(c, [...path, c.name]);
    }
  };
  walk(root, []);
  return out;
}

/** 종목명 포함 또는 종목코드 접두 일치. 이름이 질의로 시작하는 종목, 그다음 시총 큰 순. */
export function searchStocks(root: MapNode, query: string, limit = 10): StockHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return allStocks(root)
    .filter(({ stock }) => stock.name.toLowerCase().includes(q) || stock.code.startsWith(q))
    .sort((a, b) => {
      const pa = a.stock.name.toLowerCase().startsWith(q) || a.stock.code === q ? 0 : 1;
      const pb = b.stock.name.toLowerCase().startsWith(q) || b.stock.code === q ? 0 : 1;
      return pa - pb || b.stock.cap - a.stock.cap;
    })
    .slice(0, limit);
}

/** 시총 상위 n종목(+keep 종목)만 남긴 트리. 빈 업종·섹터는 제거. 모바일용. */
export function pruneTopN(root: MapNode, n: number, keep?: string | null): MapNode {
  const all = allStocks(root);
  if (all.length <= n) return root;
  const caps = all.map((h) => h.stock.cap).sort((a, b) => b - a);
  const cutoff = caps[n - 1];
  let budget = n; // 같은 시총이 여러 개여도 n개를 넘기지 않게
  const prune = (node: MapNode): MapNode | null => {
    const children: MapNode["children"] = [];
    for (const c of node.children) {
      if (isLeaf(c)) {
        if (c.code === keep || (c.cap >= cutoff && budget > 0)) {
          if (c.code !== keep) budget--;
          children.push(c);
        }
      } else {
        const p = prune(c);
        if (p) children.push(p);
      }
    }
    return children.length ? { ...node, children } : null;
  };
  return { ...root, children: prune(root)?.children ?? [] };
}

/** 한 종목이 path 아래에 있는지 */
export function isUnder(hitPath: string[], path: string[]): boolean {
  return path.every((p, i) => hitPath[i] === p);
}
