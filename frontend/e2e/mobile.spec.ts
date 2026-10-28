import { expect, test } from "@playwright/test";
import { stubNaver, waitForMap } from "./helpers";

test.beforeEach(async ({ page }) => {
  await stubNaver(page);
});

test("모바일: 가로 스크롤 없이 상위 종목 맵을 보여준다", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  await expect(page.getByText("시총 상위 200종목")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("모바일: 첫 탭은 툴팁, 같은 종목 두 번째 탭은 네이버증권", async ({ page }) => {
  await page.goto("/");
  const { box } = await waitForMap(page);
  const point = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 };
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.getByRole("tooltip")).toBeVisible();
  const popup = page.context().waitForEvent("page");
  await page.touchscreen.tap(point.x, point.y);
  const naver = await popup;
  await naver.waitForURL(/finance\.naver\.com/);
});
