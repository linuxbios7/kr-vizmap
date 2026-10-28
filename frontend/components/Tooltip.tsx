import { colorFor, type ColorMode } from "@/lib/colorScale";
import { formatCap, formatChg, formatPrice } from "@/lib/format";
import type { LeafRect } from "@/lib/treemapLayout";

const WIDTH = 300;
const MAX_PEERS = 12;

interface Props {
  /** 툴팁에 필요한 것만: 종목, 섹터·업종, 같은 업종 종목 */
  leaf: Pick<LeafRect, "stock" | "sector" | "industry" | "peers">;
  x: number;
  y: number;
  bounds: { w: number; h: number };
  colorMode: ColorMode;
  range: number;
}

export default function Tooltip({ leaf, x, y, bounds, colorMode, range }: Props) {
  const s = leaf.stock;
  // 호버 종목이 상위 목록 밖이면 마지막 줄에 덧붙인다
  const top = leaf.peers.slice(0, MAX_PEERS);
  const peers = top.some((p) => p.code === s.code) ? top : [...top.slice(0, -1), s];
  const estH = 110 + peers.length * 22;
  const width = Math.min(WIDTH, bounds.w - 8);

  let left = x + 16;
  if (left + width > bounds.w) left = x - 16 - width;
  if (left < 4) left = Math.max(4, (bounds.w - width) / 2); // 좁은 화면: 가운데
  const topPx = Math.max(4, Math.min(y + 16, bounds.h - estH - 4));

  return (
    <div className="tooltip" style={{ left, top: topPx, width }} role="tooltip">
      <div className="tooltip-path">
        {leaf.sector} › {leaf.industry}
      </div>
      <div className="tooltip-head" style={{ background: colorFor(s.chg, colorMode, range) }}>
        <div>
          <strong>{s.name}</strong> <span className="tooltip-code">{s.code}</span>
        </div>
        <div className="tooltip-head-row">
          <span>{formatPrice(s.price)}원</span>
          <strong>{formatChg(s.chg)}</strong>
        </div>
        <div className="tooltip-head-row tooltip-sub">
          <span>{s.market}</span>
          <span>시총 {formatCap(s.cap)}</span>
        </div>
      </div>
      <table className="tooltip-peers">
        <tbody>
          {peers.map((p) => (
            <tr key={p.code} className={p.code === s.code ? "active" : undefined}>
              <td className="name">{p.name}</td>
              <td className="num">{formatPrice(p.price)}</td>
              <td className="num chg" style={{ background: colorFor(p.chg, colorMode, range) }}>
                {formatChg(p.chg)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
