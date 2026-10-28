import { colorFor, legendStops, type ColorMode } from "@/lib/colorScale";

export default function Legend({ colorMode, range }: { colorMode: ColorMode; range: number }) {
  return (
    <div className="legend" aria-label="색상 범례">
      {legendStops(range).map((v) => (
        <span key={v} className="legend-cell" style={{ background: colorFor(v, colorMode, range) }}>
          {v > 0 ? "+" : ""}
          {Number.isInteger(v) ? v : v.toFixed(1)}%
        </span>
      ))}
    </div>
  );
}
