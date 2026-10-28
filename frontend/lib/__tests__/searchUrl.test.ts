import { describe, expect, it } from "vitest";
import type { MapNode, StockLeaf } from "../api";
import { allStocks, isUnder, pruneTopN, searchStocks } from "../search";
import { DEFAULT_STATE, parseState, serializeState } from "../urlState";

const s = (code: string, name: string, cap: number): StockLeaf => ({
  code,
  name,
  market: "KOSPI",
  cap,
  chg: 0,
  price: 1,
});

const tree: MapNode = {
  name: "KOSPI",
  children: [
    {
      name: "IT",
      children: [
        {
          name: "반도체",
          children: [s("005930", "삼성전자", 900), s("000660", "SK하이닉스", 500)],
        },
        { name: "전기제품", children: [s("006400", "삼성SDI", 50)] },
      ],
    },
    {
      name: "금융",
      children: [{ name: "생명보험", children: [s("032830", "삼성생명", 100)] }],
    },
  ],
};

describe("searchStocks", () => {
  it("이름 포함·코드 접두 검색, 이름이 질의로 시작하는 종목 먼저, 그다음 시총 순", () => {
    expect(searchStocks(tree, "삼성").map((h) => h.stock.code)).toEqual([
      "005930",
      "032830",
      "006400",
    ]);
    expect(searchStocks(tree, "하이닉스")[0].path).toEqual(["IT", "반도체"]);
    expect(searchStocks(tree, "0006")[0].stock.name).toBe("SK하이닉스");
    expect(searchStocks(tree, "sk")[0].stock.code).toBe("000660"); // 대소문자 무시
    expect(searchStocks(tree, "  ")).toEqual([]);
  });
});

describe("pruneTopN", () => {
  it("시총 상위 n개만 남기고 빈 그룹을 없앤다", () => {
    const p = pruneTopN(tree, 2);
    expect(allStocks(p).map((h) => h.stock.code)).toEqual(["005930", "000660"]);
    expect(p.children.map((c) => c.name)).toEqual(["IT"]);
  });

  it("keep 종목은 순위 밖이어도 남긴다", () => {
    const codes = allStocks(pruneTopN(tree, 2, "006400")).map((h) => h.stock.code);
    expect(codes).toContain("006400");
    expect(codes).toHaveLength(3);
  });

  it("종목 수가 n 이하면 그대로", () => {
    expect(pruneTopN(tree, 10)).toBe(tree);
  });
});

describe("isUnder", () => {
  it("줌 경로 포함 여부", () => {
    expect(isUnder(["IT", "반도체"], [])).toBe(true);
    expect(isUnder(["IT", "반도체"], ["IT"])).toBe(true);
    expect(isUnder(["IT", "반도체"], ["금융"])).toBe(false);
  });
});

describe("urlState", () => {
  it("기본값은 빈 쿼리", () => {
    expect(serializeState(DEFAULT_STATE)).toBe("");
    expect(parseState(new URLSearchParams(""))).toEqual(DEFAULT_STATE);
  });

  it("왕복 변환", () => {
    const st = {
      market: "KOSDAQ" as const,
      period: "1w" as const,
      colorMode: "us" as const,
      path: ["섬유,의류,신발,호화품"],
      highlight: "005930",
      view: "bubble" as const,
      bx: "cap" as const,
      by: "turnover" as const,
      bg: "sector" as const,
    };
    expect(parseState(new URLSearchParams(serializeState(st)))).toEqual(st);
  });

  it("잘못된 값은 기본값으로", () => {
    const st = parseState(new URLSearchParams("m=NYSE&p=2y&c=x&s=<script>&z=a&z=b&z=c"));
    expect(st.market).toBe("KOSPI");
    expect(st.period).toBe("1d");
    expect(st.colorMode).toBe("kr");
    expect(st.highlight).toBeNull();
    expect(st.path).toEqual(["a", "b"]);
  });

  it("맵 화면에서는 버블 설정을 URL에 넣지 않는다", () => {
    expect(serializeState({ ...DEFAULT_STATE, bx: "cap" })).toBe("");
    expect(serializeState({ ...DEFAULT_STATE, view: "bubble", bg: "sector" })).toBe(
      "v=bubble&bg=sector",
    );
    expect(parseState(new URLSearchParams("v=x&bx=pe&bg=y")).view).toBe("map");
  });
});
