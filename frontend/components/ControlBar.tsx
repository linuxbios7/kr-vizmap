import type { Market, Period } from "@/lib/api";
import type { ColorMode } from "@/lib/colorScale";

const MARKETS: { value: Market; label: string }[] = [
  { value: "KOSPI", label: "KOSPI" },
  { value: "KOSDAQ", label: "KOSDAQ" },
  { value: "ALL", label: "전체" },
];

const PERIODS: { value: Period; label: string }[] = [
  { value: "1d", label: "1일" },
  { value: "1w", label: "1주" },
  { value: "1m", label: "1개월" },
  { value: "3m", label: "3개월" },
  { value: "6m", label: "6개월" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1년" },
];

interface Props {
  market: Market;
  period: Period;
  colorMode: ColorMode;
  onMarket: (m: Market) => void;
  onPeriod: (p: Period) => void;
  onColorMode: (c: ColorMode) => void;
}

function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          className={it.value === value ? "active" : undefined}
          aria-pressed={it.value === value}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function ControlBar(p: Props) {
  return (
    <div className="controlbar">
      <Segmented label="시장" items={MARKETS} value={p.market} onChange={p.onMarket} />
      <Segmented label="기간" items={PERIODS} value={p.period} onChange={p.onPeriod} />
      <Segmented
        label="색상"
        items={[
          { value: "kr" as ColorMode, label: "상승 빨강" },
          { value: "us" as ColorMode, label: "상승 초록" },
        ]}
        value={p.colorMode}
        onChange={p.onColorMode}
      />
    </div>
  );
}
