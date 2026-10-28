import { describe, expect, it } from "vitest";
import { dataUrls } from "../dataSource";
import { isMarketOpen, isStale } from "../staleness";

describe("dataUrls", () => {
  it("서버 모드는 /api", () => {
    const u = dataUrls(false, "/ignored");
    expect(u.map("KOSPI", "1w")).toBe("/api/map?market=KOSPI&period=1w");
    expect(u.bubbles("ALL")).toBe("/api/bubbles?market=ALL");
    expect(u.health).toBe("/api/health");
  });

  it("정적 모드는 basePath 아래 JSON 파일", () => {
    const u = dataUrls(true, "/FinvizMap");
    expect(u.map("KOSDAQ", "ytd")).toBe("/FinvizMap/data/map/KOSDAQ-ytd.json");
    expect(u.bubbles("KOSPI")).toBe("/FinvizMap/data/bubbles/KOSPI.json");
    expect(u.health).toBe("/FinvizMap/data/health.json");
    expect(dataUrls(true, "").health).toBe("/data/health.json");
  });
});

// KST 벽시계 → 실제 시각(UTC) Date
const at = (kst: string) => new Date(new Date(kst + "Z").getTime() - 9 * 3600_000);

describe("isStale (KST)", () => {
  it("장중 판단", () => {
    expect(isMarketOpen(new Date("2026-10-26T10:00:00Z"))).toBe(true); // 월요일 KST 벽시계
    expect(isMarketOpen(new Date("2026-10-25T10:00:00Z"))).toBe(false); // 일요일
  });

  it("장중: 마지막 수집이 maxLag보다 오래되면 지연", () => {
    const now = at("2026-10-26T11:00:00");
    expect(isStale("2026-10-26T10:30:00", now, 60)).toBe(false);
    expect(isStale("2026-10-26T09:30:00", now, 60)).toBe(true);
  });

  it("장 마감 후: 오늘 시세가 없으면 지연, 주말은 금요일 시세로 정상", () => {
    expect(isStale("2026-10-26T15:30:00", at("2026-10-26T18:00:00"), 60)).toBe(false);
    expect(isStale("2026-10-23T15:30:00", at("2026-10-26T18:00:00"), 60)).toBe(true);
    expect(isStale("2026-10-23T15:30:00", at("2026-10-25T12:00:00"), 60)).toBe(false);
    expect(isStale(null, at("2026-10-26T11:00:00"), 60)).toBe(true);
  });
});
