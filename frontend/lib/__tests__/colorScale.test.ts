import { describe, expect, it } from "vitest";
import { colorFor, legendStops, NO_DATA_COLOR, PERIOD_RANGE } from "../colorScale";

describe("colorFor", () => {
  it("0%는 중립색", () => {
    expect(colorFor(0, "kr", 3)).toBe("rgb(65,69,84)");
    expect(colorFor(0, "us", 3)).toBe("rgb(65,69,84)");
  });

  it("한국식: 상승 빨강, 하락 파랑 / 미국식: 상승 초록, 하락 빨강", () => {
    expect(colorFor(3, "kr", 3)).toBe("rgb(246,53,56)");
    expect(colorFor(-3, "kr", 3)).toBe("rgb(44,112,230)");
    expect(colorFor(3, "us", 3)).toBe("rgb(48,204,90)");
    expect(colorFor(-3, "us", 3)).toBe("rgb(246,53,56)");
  });

  it("단계 경계값과 범위 밖 값", () => {
    expect(colorFor(1, "kr", 3)).toBe("rgb(139,68,78)");
    expect(colorFor(2, "kr", 3)).toBe("rgb(191,64,69)");
    expect(colorFor(25, "kr", 3)).toBe(colorFor(3, "kr", 3));
    expect(colorFor(-25, "kr", 3)).toBe(colorFor(-3, "kr", 3));
  });

  it("기간별 범위로 스케일된다", () => {
    expect(colorFor(10, "kr", PERIOD_RANGE["1m"])).toBe(colorFor(3, "kr", 3));
    expect(colorFor(5, "kr", 10)).toBe(colorFor(1.5, "kr", 3));
  });

  it("값이 없으면 회색", () => {
    expect(colorFor(null, "kr", 3)).toBe(NO_DATA_COLOR);
  });
});

describe("legendStops", () => {
  it("±range 7단계", () => {
    expect(legendStops(3)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(legendStops(30)).toEqual([-30, -20, -10, 0, 10, 20, 30]);
  });
});
