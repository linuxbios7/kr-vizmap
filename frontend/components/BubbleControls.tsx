import { METRICS, type BubbleGroup, type BubbleMetric } from "@/lib/bubbleLayout";

interface Props {
  x: BubbleMetric;
  y: BubbleMetric;
  group: BubbleGroup;
  onChange: (patch: { bx?: BubbleMetric; by?: BubbleMetric; bg?: BubbleGroup }) => void;
}

function MetricSelect(props: {
  label: string;
  value: BubbleMetric;
  onChange: (m: BubbleMetric) => void;
}) {
  return (
    <label className="metric-select">
      <span>{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as BubbleMetric)}
        aria-label={`${props.label} 지표`}
      >
        {METRICS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function BubbleControls({ x, y, group, onChange }: Props) {
  return (
    <div className="bubble-controls">
      <div className="segmented" role="group" aria-label="묶음">
        {(
          [
            ["all", "전체 보기"],
            ["sector", "섹터별 보기"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={group === v ? "active" : undefined}
            aria-pressed={group === v}
            onClick={() => onChange({ bg: v })}
          >
            {l}
          </button>
        ))}
      </div>
      <MetricSelect label="X축" value={x} onChange={(m) => onChange({ bx: m })} />
      <MetricSelect label="Y축" value={y} onChange={(m) => onChange({ by: m })} />
      <button
        type="button"
        className="swap"
        aria-label="X·Y축 바꾸기"
        onClick={() => onChange({ bx: y, by: x })}
      >
        ⇄
      </button>
      <span className="muted bubble-note">크기: 시가총액 · 색: 등락률</span>
    </div>
  );
}
