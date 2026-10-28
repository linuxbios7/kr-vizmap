import { expect, test } from "@playwright/test";
import { stubNaver, waitForMap } from "./helpers";

test.beforeEach(async ({ page }) => {
  await stubNaver(page);
});

test("맵·범례·기준시각이 표시된다", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  await expect(page.getByLabel("색상 범례")).toContainText("+3%");
  await expect(page.getByRole("button", { name: "KOSPI", pressed: true })).toBeVisible();
});

test("종목에 마우스를 올리면 업종 툴팁이 뜬다", async ({ page }) => {
  await page.goto("/");
  const { box } = await waitForMap(page);
  // 가장 큰 섹터(IT, 왼쪽 위)의 종목 영역
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.4);
  const tip = page.getByRole("tooltip");
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("IT › 반도체와반도체장비");
  await page.mouse.move(box.x + box.width + 50, box.y - 50); // 캔버스 밖
  await expect(tip).toBeHidden();
});

test("섹터 헤더 클릭으로 확대, Esc로 축소하고 URL에 반영된다", async ({ page }) => {
  await page.goto("/");
  const { box } = await waitForMap(page);
  await page.mouse.click(box.x + 8, box.y + 8); // IT 섹터 헤더 띠
  await expect(page).toHaveURL(/z=IT/);
  await expect(page.getByLabel("줌 경로")).toContainText("KOSPI›IT");
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/z=/);
});

test("종목 클릭은 네이버증권 새 창을 연다", async ({ page }) => {
  await page.goto("/");
  const { box } = await waitForMap(page);
  const popup = page.context().waitForEvent("page");
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.4);
  const naver = await popup;
  await naver.waitForURL(/finance\.naver\.com\/item\/main\.naver\?code=\d{6}/);
});

test("검색으로 종목을 강조하고 URL에 남긴다", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  const input = page.getByRole("combobox", { name: "종목 검색" });
  await input.fill("현대");
  await page.getByRole("option", { name: /현대차/ }).click();
  await expect(page).toHaveURL(/s=005380/);
  await expect(input).toHaveValue("현대차");
  await page.getByRole("button", { name: "검색 지우기" }).click();
  await expect(page).not.toHaveURL(/s=/);
});

test("URL 쿼리로 상태가 복원된다", async ({ page }) => {
  await page.goto("/?m=KOSDAQ&p=1w&c=us&s=247540");
  await waitForMap(page);
  await expect(page.getByRole("button", { name: "KOSDAQ", pressed: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1주", pressed: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "상승 초록", pressed: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "종목 검색" })).toHaveValue("에코프로비엠");
  await expect(page.getByText(/비교일 \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await expect(page.getByLabel("색상 범례")).toContainText("+6%");
});

test("시장 전환 시 없는 줌 경로는 루트로 돌아간다", async ({ page }) => {
  await page.goto("/?z=경기관련소비재");
  await waitForMap(page);
  await expect(page.getByLabel("줌 경로")).toContainText("경기관련소비재");
  await page.getByRole("button", { name: "KOSDAQ" }).click();
  await expect(page.getByLabel("줌 경로")).not.toContainText("경기관련소비재");
});

test.describe("버블 차트", () => {
  async function waitForBubbles(page: import("@playwright/test").Page) {
    const canvas = page.getByRole("img", { name: "버블 차트" });
    await expect(canvas).toHaveAttribute("data-ready", "true");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no box");
    return box;
  }

  test("맵↔버블 전환, 축·묶음 변경이 URL에 남는다", async ({ page }) => {
    await page.goto("/");
    await waitForMap(page);
    await page.getByRole("button", { name: "버블" }).click();
    await expect(page).toHaveURL(/v=bubble/);
    await waitForBubbles(page);

    await page.getByLabel("X축 지표").selectOption("cap");
    await expect(page).toHaveURL(/bx=cap/);
    await page.getByRole("button", { name: "X·Y축 바꾸기" }).click();
    await expect(page).toHaveURL(/bx=chg/);
    await expect(page).toHaveURL(/by=cap/);

    await page.getByRole("button", { name: "섹터별 보기" }).click();
    await expect(page).toHaveURL(/bg=sector/);
    await page.getByRole("button", { name: "맵" }).click();
    await expect(page).not.toHaveURL(/v=bubble|bx=|bg=/);
  });

  test("섹터별 보기에서 섹터 이름을 누르면 그 섹터만, Esc로 돌아온다", async ({ page }) => {
    await page.goto("/?v=bubble&bg=sector");
    const box = await waitForBubbles(page);
    await page.mouse.click(box.x + 20, box.y + 9); // 첫 패널(시총 1위 섹터 IT) 제목
    await expect(page).toHaveURL(/z=IT/);
    await expect(page.getByLabel("줌 경로")).toContainText("KOSPI›IT");
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/z=/);
  });

  test("버블에 마우스를 올리면 업종 툴팁, URL로 강조 종목 복원", async ({ page }) => {
    // 고정 데이터는 거래대금이 모두 같아, 두 축을 거래대금으로 두면 버블이 그림 영역 한가운데 모인다
    await page.goto("/?v=bubble&bx=value&by=value&s=005380");
    const box = await waitForBubbles(page);
    await expect(page.getByRole("combobox", { name: "종목 검색" })).toHaveValue("현대차");
    // 그림 영역 = 캔버스에서 왼쪽 축 46px, 위 6px, 오른쪽 8px, 아래 축 18px을 뺀 곳
    const cx = box.x + 46 + (box.width - 54) / 2;
    const cy = box.y + 6 + (box.height - 24) / 2;
    await page.mouse.move(cx + 3, cy);
    await page.mouse.move(cx, cy);
    await expect(page.getByRole("tooltip")).toBeVisible();
  });
});
