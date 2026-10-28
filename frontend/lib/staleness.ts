/**
 * 시세 지연 판단 (backend app/services/market_hours.py와 같은 규칙).
 * 정적 모드에는 서버가 없으므로 브라우저에서 계산한다. 휴장일은 고려하지 않는다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 15 * 60 + 30;

/** Date → KST 벽시계 시각 (UTC 필드로 읽는다) */
function kst(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** 'YYYY-MM-DDTHH:MM:SS'(KST, 시간대 없음) → 같은 벽시계의 UTC 필드 Date */
function parseKst(s: string): Date {
  return new Date(s.slice(0, 19) + "Z");
}

const minutes = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const weekday = (d: Date) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

export function isMarketOpen(nowKst: Date): boolean {
  const m = minutes(nowKst);
  return weekday(nowKst) && m >= OPEN_MIN && m <= CLOSE_MIN;
}

/**
 * 장중이면 마지막 수집이 maxLagMin분보다 오래됐을 때, 평일 장 마감(+maxLag) 후면 오늘 시세가 없을 때 지연.
 */
export function isStale(lastCollected: string | null, now: Date, maxLagMin: number): boolean {
  if (!lastCollected) return true;
  const n = kst(now);
  const last = parseKst(lastCollected);
  if (isMarketOpen(n)) return n.getTime() - last.getTime() > maxLagMin * 60_000;
  const afterClose = weekday(n) && minutes(n) > CLOSE_MIN + maxLagMin;
  return afterClose && !sameDay(last, n) && last.getTime() < n.getTime();
}
