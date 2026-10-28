"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapResponse } from "@/lib/api";
import { colorFor, PERIOD_RANGE, type ColorMode } from "@/lib/colorScale";
import { formatChg, naverUrl } from "@/lib/format";
import {
  computeLayout,
  contains,
  findNode,
  headerHeight,
  type GroupRect,
  type Layout,
  type LeafRect,
  type Rect,
} from "@/lib/treemapLayout";
import { drawCallout, ellipsize, FONT } from "@/lib/canvasDraw";
import Tooltip from "./Tooltip";

const BG = "#15171c";
const ANIM_MS = 300;

interface Props {
  data: MapResponse;
  colorMode: ColorMode;
  path: string[];
  onZoom: (path: string[]) => void;
  highlight?: string | null;
}

type Hover =
  | { kind: "leaf"; leaf: LeafRect; x: number; y: number }
  | { kind: "group"; group: GroupRect }
  | null;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function drawLeafLabel(ctx: CanvasRenderingContext2D, l: LeafRect) {
  const w = l.x1 - l.x0;
  const h = l.y1 - l.y0;
  if (w < 22 || h < 11) return;
  const name = l.stock.name;
  let fs = Math.min(30, h / 2.6, w / 2);
  ctx.font = `600 ${fs}px ${FONT}`;
  const nw = ctx.measureText(name).width;
  if (nw > w - 6) fs *= (w - 6) / nw;
  if (fs < 7) return;
  const cx = (l.x0 + l.x1) / 2;
  const cy = (l.y0 + l.y1) / 2;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${fs}px ${FONT}`;
  const twoLines = h >= fs * 2.5;
  ctx.fillText(name, cx, twoLines ? cy - fs * 0.45 : cy);
  if (twoLines) {
    ctx.font = `${Math.max(7, fs * 0.8)}px ${FONT}`;
    ctx.fillText(formatChg(l.stock.chg), cx, cy + fs * 0.6);
  }
}

function drawGroupHeader(ctx: CanvasRenderingContext2D, g: GroupRect) {
  const w = g.x1 - g.x0;
  const hh = headerHeight(g);
  if (w < 24) return;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  if (g.depth === 1) {
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = "#e8e8e8";
  } else {
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = "#9aa0aa";
  }
  const text = ellipsize(ctx, g.name, w - 6);
  if (text) ctx.fillText(text, g.x0 + 3, g.y0 + hh / 2 + 0.5);
}

export default function TreemapCanvas({ data, colorMode, path, onZoom, highlight }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hover>(null);
  const animRef = useRef<number | null>(null);
  const prevRef = useRef<{ layout: Layout; path: string[] } | null>(null);

  const range = PERIOD_RANGE[data.period];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!size.w || !size.h) return null;
    const node = findNode(data, path) ?? data;
    return computeLayout(node, size.w, size.h, node === data ? [] : path);
  }, [data, path, size]);

  const ctx2d = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return null;
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
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }, [layout]);

  const drawFull = useCallback(
    (ctx: CanvasRenderingContext2D, lay: Layout, hv: Hover) => {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, lay.width, lay.height);
      for (const g of lay.groups) {
        ctx.fillStyle = g.depth === 1 ? "#23262e" : "#1d2026";
        ctx.fillRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
      }
      for (const l of lay.leaves) {
        ctx.fillStyle = colorFor(l.stock.chg, colorMode, range);
        ctx.fillRect(l.x0, l.y0, l.x1 - l.x0, l.y1 - l.y0);
      }
      for (const l of lay.leaves) drawLeafLabel(ctx, l);
      for (const g of lay.groups) drawGroupHeader(ctx, g);

      const outline = (r: Rect, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.strokeRect(
          r.x0 + width / 2,
          r.y0 + width / 2,
          r.x1 - r.x0 - width,
          r.y1 - r.y0 - width,
        );
      };
      if (highlight) {
        const l = lay.leaves.find((x) => x.stock.code === highlight);
        if (l) {
          // 나머지를 어둡게 하고 강조 종목만 다시 그린 뒤 이름표를 단다
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(0, 0, lay.width, lay.height);
          ctx.fillStyle = colorFor(l.stock.chg, colorMode, range);
          ctx.fillRect(l.x0, l.y0, l.x1 - l.x0, l.y1 - l.y0);
          drawLeafLabel(ctx, l);
          outline(l, "#ffe14d", Math.min(3, (l.x1 - l.x0) / 2, (l.y1 - l.y0) / 2));
          drawCallout(ctx, l, `${l.stock.name} ${formatChg(l.stock.chg)}`, lay.width, lay.height);
        }
      }
      if (hv?.kind === "leaf") {
        const ind = lay.groups.find(
          (g) => g.depth === 2 && g.name === hv.leaf.industry && contains(g, hv.x, hv.y),
        );
        if (ind) outline(ind, "#f5c542", 1);
        outline(hv.leaf, "#ffffff", 2);
      } else if (hv?.kind === "group") {
        outline(hv.group, "#f5c542", 2);
      }
    },
    [colorMode, range, highlight],
  );

  // 레이아웃·색 변경 시 그리기 (줌 변경이면 전환 애니메이션)
  useEffect(() => {
    if (!layout) return;
    const ctx = ctx2d();
    if (!ctx) return;
    const prev = prevRef.current;
    prevRef.current = { layout, path };
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const zoomChanged =
      prev &&
      prev.layout.width === layout.width &&
      prev.layout.height === layout.height &&
      prev.path.join("/") !== path.join("/");
    if (!zoomChanged) {
      drawFull(ctx, layout, null);
      return;
    }

    // 확대: 이전 화면의 종목 위치 → 새 위치. 축소: 이전 뷰 영역을 화면 전체로 늘린 위치 → 새 위치.
    const zoomIn = path.length > prev.path.length;
    const oldPos = new Map(prev.layout.leaves.map((l) => [l.stock.code, l as Rect]));
    let from: (l: LeafRect) => Rect | undefined = (l) => oldPos.get(l.stock.code);
    if (!zoomIn) {
      const g = layout.groups.find((x) => x.path.join("/") === prev.path.join("/"));
      if (g) {
        const sx = layout.width / (g.x1 - g.x0);
        const sy = layout.height / (g.y1 - g.y0);
        from = (l) => ({
          x0: (l.x0 - g.x0) * sx,
          y0: (l.y0 - g.y0) * sy,
          x1: (l.x1 - g.x0) * sx,
          y1: (l.y1 - g.y0) * sy,
        });
      }
    }

    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / ANIM_MS);
      if (t >= 1) {
        animRef.current = null;
        drawFull(ctx, layout, null);
        return;
      }
      const e = ease(t);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, layout.width, layout.height);
      for (const l of layout.leaves) {
        const f = from(l) ?? l;
        const x0 = lerp(f.x0, l.x0, e);
        const y0 = lerp(f.y0, l.y0, e);
        ctx.fillStyle = colorFor(l.stock.chg, colorMode, range);
        ctx.fillRect(x0, y0, lerp(f.x1, l.x1, e) - x0, lerp(f.y1, l.y1, e) - y0);
      }
      animRef.current = requestAnimationFrame(frame);
    };
    animRef.current = requestAnimationFrame(frame);
    setHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, drawFull]);

  // 호버 변경 시 다시 그리기 (애니메이션 중이면 건너뜀)
  useEffect(() => {
    if (!layout || animRef.current) return;
    const ctx = ctx2d();
    if (ctx) drawFull(ctx, layout, hover);
  }, [hover, layout, ctx2d, drawFull]);

  const hitTest = useCallback(
    (x: number, y: number): Hover => {
      if (!layout) return null;
      const leaf = layout.leaves.find((l) => contains(l, x, y));
      if (leaf) return { kind: "leaf", leaf, x, y };
      // 헤더 띠: 업종(안쪽) 먼저
      const groups = [...layout.groups].sort((a, b) => b.depth - a.depth);
      const g = groups.find(
        (g) => x >= g.x0 && x < g.x1 && y >= g.y0 && y < g.y0 + headerHeight(g),
      );
      return g ? { kind: "group", group: g } : null;
    },
    [layout],
  );

  const pos = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // 마우스: 호버로 툴팁, 클릭으로 이동. 터치: 첫 탭은 툴팁, 같은 종목을 한 번 더 탭하면 이동.
  const pointerType = useRef("mouse");

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const { x, y } = pos(e);
    setHover(hitTest(x, y));
  };

  const onClick = (e: React.MouseEvent) => {
    const { x, y } = pos(e);
    const hv = hitTest(x, y);
    if (hv?.kind === "group") {
      onZoom(hv.group.path);
    } else if (hv?.kind === "leaf") {
      const touch = pointerType.current !== "mouse";
      const sameAsShown = hover?.kind === "leaf" && hover.leaf.stock.code === hv.leaf.stock.code;
      if (touch && !sameAsShown) setHover(hv);
      else window.open(naverUrl(hv.leaf.stock.code), "_blank", "noopener");
    } else {
      setHover(null);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if (!path.length) return;
    e.preventDefault();
    onZoom(path.slice(0, -1));
  };

  return (
    <div ref={wrapRef} className="map-canvas-wrap">
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => (pointerType.current = e.pointerType)}
        onPointerMove={onPointerMove}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{ cursor: hover ? "pointer" : "default", display: "block" }}
        aria-label="시가총액 트리맵"
        role="img"
        data-ready={layout ? "true" : "false"}
      />
      {hover?.kind === "leaf" && (
        <Tooltip
          leaf={hover.leaf}
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
