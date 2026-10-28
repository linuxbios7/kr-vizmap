"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BubbleStock, MapNode, Period, StockLeaf } from "@/lib/api";
import {
  computeBubbleLayout,
  formatMetric,
  hitBubble,
  METRICS,
  PANEL_TITLE,
  type Bubble,
  type BubbleGroup,
  type BubbleLayout,
  type BubbleMetric,
  type Panel,
  type Scale,
} from "@/lib/bubbleLayout";
import { drawCallout, ellipsize, FONT } from "@/lib/canvasDraw";
import { colorFor, PERIOD_RANGE, type ColorMode } from "@/lib/colorScale";
import { formatChg, naverUrl } from "@/lib/format";
import { findNode, isLeaf } from "@/lib/treemapLayout";
import Tooltip from "./Tooltip";

const BG = "#15171c";
const PANEL_BG = "#1b1e24";
const GRID = "#2a2e37";
const AXIS_TEXT = "#8a8f98";

interface Props {
  stocks: BubbleStock[];
  /** 검색·툴팁용 트리 (같은 업종 종목 목록) */
  tree: MapNode;
  x: BubbleMetric;
  y: BubbleMetric;
  period: Period;
  group: BubbleGroup;
  colorMode: ColorMode;
  path: string[];
  onZoom: (path: string[]) => void;
  highlight?: string | null;
}

type Hover =
  { kind: "bubble"; bubble: Bubble; x: number; y: number } | { kind: "panel"; panel: Panel } | null;

const label = (m: BubbleMetric) => METRICS.find((x) => x.value === m)!.label;

function drawAxes(
  ctx: CanvasRenderingContext2D,
  p: Panel,
  xs: Scale,
  ys: Scale,
  xm: BubbleMetric,
  ym: BubbleMetric,
  showTitles: boolean,
) {
  const { plot } = p;
  const w = plot.x1 - plot.x0;
  const h = plot.y1 - plot.y0;
  ctx.font = `10px ${FONT}`;
  ctx.lineWidth = 1;

  // 눈금 글자가 겹치면 건너뛴다 (격자선은 그대로)
  let lastRight = -Infinity;
  for (const t of xs.ticks) {
    const x = Math.round(plot.x0 + xs.norm(t) * w) + 0.5;
    ctx.strokeStyle = xm === "chg" && t === 0 ? "#5a606c" : GRID;
    ctx.beginPath();
    ctx.moveTo(x, plot.y0);
    ctx.lineTo(x, plot.y1);
    ctx.stroke();
    const text = formatMetric(t, xm);
    const tw = ctx.measureText(text).width;
    if (x - tw / 2 < lastRight + 6) continue;
    lastRight = x + tw / 2;
    ctx.fillStyle = AXIS_TEXT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, x, plot.y1 + 3);
  }
  let lastY = Infinity;
  for (const t of ys.ticks) {
    const y = Math.round(plot.y1 - ys.norm(t) * h) + 0.5;
    const skip = lastY - y < 12;
    if (!skip) lastY = y;
    ctx.strokeStyle = ym === "chg" && t === 0 ? "#5a606c" : GRID;
    ctx.beginPath();
    ctx.moveTo(plot.x0, y);
    ctx.lineTo(plot.x1, y);
    ctx.stroke();
    if (skip) continue;
    ctx.fillStyle = AXIS_TEXT;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(formatMetric(t, ym), plot.x0 - 4, y);
  }
  ctx.strokeStyle = "#3a3f4a";
  ctx.strokeRect(plot.x0 + 0.5, plot.y0 + 0.5, w - 1, h - 1);

  if (showTitles) {
    ctx.fillStyle = "#b8bcc4";
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${label(xm)} →`, plot.x1 - 4, plot.y1 - 4);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`↑ ${label(ym)}`, plot.x0 + 4, plot.y0 + 4);
  }
}

export default function BubbleCanvas(props: Props) {
  const { stocks, tree, x, y, period, group, colorMode, path, onZoom, highlight } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hover>(null);
  const pointerType = useRef("mouse");
  const range = PERIOD_RANGE[period];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 줌(섹터·업종 선택) 중이면 그 범위만, 한 판으로
  const visible = useMemo(
    () =>
      stocks.filter(
        (s) => (!path[0] || s.sector === path[0]) && (!path[1] || s.industry === path[1]),
      ),
    [stocks, path],
  );
  const layout = useMemo<BubbleLayout | null>(() => {
    if (!size.w || !size.h) return null;
    return computeBubbleLayout(visible, {
      width: size.w,
      height: size.h,
      x,
      y,
      period,
      group: path.length ? "all" : group,
    });
  }, [visible, size, x, y, period, group, path.length]);

  // 업종별 종목(툴팁용)
  const peersOf = useCallback(
    (s: BubbleStock): StockLeaf[] => {
      const node = findNode(tree, [s.sector, s.industry]);
      return node ? node.children.filter(isLeaf) : [];
    },
    [tree],
  );

  const draw = useCallback(
    (hv: Hover) => {
      const canvas = canvasRef.current;
      if (!canvas || !layout) return;
      const dpr = window.devicePixelRatio || 1;
      const W = Math.round(layout.width * dpr);
      const H = Math.round(layout.height * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
        canvas.style.width = `${layout.width}px`;
        canvas.style.height = `${layout.height}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, layout.width, layout.height);

      const multi = layout.panels.length > 1;
      for (const p of layout.panels) {
        ctx.fillStyle = PANEL_BG;
        ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
        if (multi) {
          ctx.font = `700 12px ${FONT}`;
          ctx.fillStyle = "#e8e8e8";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const t = ellipsize(ctx, p.name, p.x1 - p.x0 - 8);
          if (t) ctx.fillText(t, p.x0 + 6, p.y0 + PANEL_TITLE / 2 + 2);
        }
        drawAxes(ctx, p, layout.xScale, layout.yScale, x, y, !multi);
      }

      const drawBubble = (b: Bubble, alpha = 0.85) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colorFor(b.stock.chg[period], colorMode, range);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 0.75;
        ctx.stroke();
        if (b.r >= 15) {
          const fs = Math.min(14, b.r * 0.45);
          ctx.font = `600 ${fs}px ${FONT}`;
          const name = ellipsize(ctx, b.stock.name, b.r * 1.9);
          if (name) {
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(name, b.x, b.y);
          }
        }
      };
      const ring = (b: Bubble, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + width / 2, 0, Math.PI * 2);
        ctx.stroke();
      };

      layout.panels.forEach((p, i) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.plot.x0, p.plot.y0, p.plot.x1 - p.plot.x0, p.plot.y1 - p.plot.y0);
        ctx.clip();
        for (const b of layout.bubbles) if (b.panel === i) drawBubble(b);
        ctx.restore();
      });

      if (highlight) {
        const b = layout.bubbles.find((v) => v.stock.code === highlight);
        if (b) {
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(0, 0, layout.width, layout.height);
          drawBubble(b, 1);
          ring(b, "#ffe14d", 3);
          const box = { x0: b.x - b.r, y0: b.y - b.r, x1: b.x + b.r, y1: b.y + b.r };
          const text = `${b.stock.name} ${formatChg(b.stock.chg[period])}`;
          drawCallout(ctx, box, text, layout.width, layout.height);
        }
      }

      if (hv?.kind === "bubble") {
        const s = hv.bubble.stock;
        for (const b of layout.bubbles)
          if (b.stock.industry === s.industry && b.stock.code !== s.code) ring(b, "#f5c542", 1);
        ring(hv.bubble, "#ffffff", 2);
      } else if (hv?.kind === "panel") {
        const p = hv.panel;
        ctx.strokeStyle = "#f5c542";
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x0 + 1, p.y0 + 1, p.x1 - p.x0 - 2, p.y1 - p.y0 - 2);
      }
    },
    [layout, x, y, period, colorMode, range, highlight],
  );

  useEffect(() => draw(hover), [draw, hover]);
  useEffect(() => setHover(null), [layout]);

  const hitTest = (px: number, py: number): Hover => {
    if (!layout) return null;
    const b = hitBubble(layout, px, py);
    if (b) return { kind: "bubble", bubble: b, x: px, y: py };
    if (layout.panels.length > 1) {
      const p = layout.panels.find(
        (p) => px >= p.x0 && px < p.x1 && py >= p.y0 && py < p.y0 + PANEL_TITLE + 4,
      );
      if (p) return { kind: "panel", panel: p };
    }
    return null;
  };

  const pos = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const onClick = (e: React.MouseEvent) => {
    const { px, py } = pos(e);
    const hv = hitTest(px, py);
    if (hv?.kind === "panel") {
      onZoom(hv.panel.path);
    } else if (hv?.kind === "bubble") {
      const touch = pointerType.current !== "mouse";
      const same = hover?.kind === "bubble" && hover.bubble.stock.code === hv.bubble.stock.code;
      if (touch && !same) setHover(hv);
      else window.open(naverUrl(hv.bubble.stock.code), "_blank", "noopener");
    } else {
      setHover(null);
    }
  };

  const tip =
    hover?.kind === "bubble"
      ? {
          stock: {
            code: hover.bubble.stock.code,
            name: hover.bubble.stock.name,
            market: hover.bubble.stock.market,
            cap: hover.bubble.stock.cap,
            chg: hover.bubble.stock.chg[period],
            price: hover.bubble.stock.price,
          },
          sector: hover.bubble.stock.sector,
          industry: hover.bubble.stock.industry,
          peers: peersOf(hover.bubble.stock),
        }
      : null;

  return (
    <div ref={wrapRef} className="map-canvas-wrap">
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => (pointerType.current = e.pointerType)}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          const { px, py } = pos(e);
          setHover(hitTest(px, py));
        }}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
        onClick={onClick}
        onContextMenu={(e) => {
          if (!path.length) return;
          e.preventDefault();
          onZoom(path.slice(0, -1));
        }}
        style={{ cursor: hover ? "pointer" : "default", display: "block" }}
        aria-label="버블 차트"
        role="img"
        data-ready={layout ? "true" : "false"}
      />
      {tip && hover?.kind === "bubble" && (
        <Tooltip
          leaf={tip}
          x={hover.x}
          y={hover.y}
          bounds={size}
          colorMode={colorMode}
          range={range}
        />
      )}
    </div>
  );
}
