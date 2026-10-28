import { expect, type Page } from "@playwright/test";

/** 네이버증권 새 창은 실제로 나가지 않게 가짜 응답으로 막는다 */
export async function stubNaver(page: Page) {
  await page
    .context()
    .route("https://finance.naver.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>" }),
    );
}

/** 맵이 그려질 때까지 기다리고 캔버스 위치를 돌려준다 */
export async function waitForMap(page: Page) {
  const canvas = page.getByRole("img", { name: "시가총액 트리맵" });
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await expect(page.getByText(/기준 2026-10-26 15:30/)).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no box");
  return { canvas, box };
}
