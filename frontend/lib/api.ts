export type Market = "KOSPI" | "KOSDAQ" | "ALL";
export type Period = "1d" | "1w" | "1m" | "3m" | "6m" | "ytd" | "1y";

export interface StockLeaf {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  cap: number;
  chg: number | null; // 기준일 시세가 없으면 null
  price: number;
}

export interface MapNode {
  name: string;
  children: (MapNode | StockLeaf)[];
}

export interface MapResponse extends MapNode {
  asof: string | null;
  market: Market;
  period: Period;
  base_date: string | null;
}

export async function fetcher<T>(url: string): Promise<T> {
  // 정적 파일은 브라우저 캐시(GitHub Pages는 10분)를 쓰지 말고 매번 ETag로 갱신 여부를 확인한다
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface BubbleStock {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string;
  industry: string;
  cap: number;
  price: number;
  value: number; // 거래대금(원)
  chg: Record<Period, number | null>;
}

export interface BubbleResponse {
  asof: string | null;
  market: Market;
  base_dates: Record<Period, string | null>;
  stocks: BubbleStock[];
}
