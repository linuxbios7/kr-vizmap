export const FONT = 'system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 폭에 맞게 말줄임. 한 글자도 안 들어가면 null */
export function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string | null {
  if (ctx.measureText(text).width <= maxW) return text;
  for (let n = text.length - 1; n > 0; n--) {
    const s = text.slice(0, n) + "…";
    if (ctx.measureText(s).width <= maxW) return s;
  }
  return null;
}

/** 대상 위(공간이 없으면 아래)에 노란 이름표 */
export function drawCallout(
  ctx: CanvasRenderingContext2D,
  target: Box,
  text: string,
  width: number,
  height: number,
) {
  ctx.font = `700 13px ${FONT}`;
  const w = ctx.measureText(text).width + 14;
  const h = 22;
  const cx = (target.x0 + target.x1) / 2;
  const x = Math.max(2, Math.min(cx - w / 2, width - w - 2));
  const above = target.y0 - h - 6 >= 0;
  const y = above ? target.y0 - h - 6 : Math.min(target.y1 + 6, height - h - 2);
  ctx.fillStyle = "#ffe14d";
  ctx.fillRect(x, y, w, h);
  ctx.beginPath();
  const ax = Math.max(x + 6, Math.min(cx, x + w - 6));
  if (above) {
    ctx.moveTo(ax - 5, y + h);
    ctx.lineTo(ax + 5, y + h);
    ctx.lineTo(ax, y + h + 5);
  } else {
    ctx.moveTo(ax - 5, y);
    ctx.lineTo(ax + 5, y);
    ctx.lineTo(ax, y - 5);
  }
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 7, y + h / 2 + 0.5);
}
