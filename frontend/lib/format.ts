export function formatChg(chg: number | null): string {
  if (chg === null) return "-";
  return `${chg > 0 ? "+" : ""}${chg.toFixed(2)}%`;
}

export function formatPrice(p: number): string {
  return Math.round(p).toLocaleString("ko-KR");
}

/** 원 단위 시가총액 → '1,245.3조' / '8,120억' */
export function formatCap(won: number): string {
  if (won >= 1e12) return `${(won / 1e12).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}조`;
  return `${Math.round(won / 1e8).toLocaleString("ko-KR")}억`;
}

export function naverUrl(code: string): string {
  return `https://finance.naver.com/item/main.naver?code=${code}`;
}
