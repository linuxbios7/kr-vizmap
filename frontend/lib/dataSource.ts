import type { Market, Period } from "./api";

/**
 * 데이터 위치. 서버 모드는 FastAPI(/api), 정적 모드(GitHub Pages)는 수집 잡이 내보낸 JSON 파일.
 * 값은 next.config.ts의 env로 빌드 시점에 박힌다.
 */
export const STATIC_DATA = process.env.KRMAP_STATIC === "1";
export const BASE_PATH = process.env.KRMAP_BASE_PATH ?? "";

export function dataUrls(isStatic: boolean, base: string) {
  return isStatic
    ? {
        map: (m: Market, p: Period) => `${base}/data/map/${m}-${p}.json`,
        bubbles: (m: Market) => `${base}/data/bubbles/${m}.json`,
        health: `${base}/data/health.json`,
      }
    : {
        map: (m: Market, p: Period) => `/api/map?market=${m}&period=${p}`,
        bubbles: (m: Market) => `/api/bubbles?market=${m}`,
        health: "/api/health",
      };
}

export const urls = dataUrls(STATIC_DATA, BASE_PATH);
