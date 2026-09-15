import { expect, request, test } from "@playwright/test";

const INPUTS = {
  initial: "input-initial",
  peak: "input-peak",
  released: "input-released",
} as const;

async function fillReadings(
  page: import("@playwright/test").Page,
  values: { initial: string; peak: string; released: string },
) {
  for (const [name, testid] of Object.entries(INPUTS) as [keyof typeof INPUTS, string][]) {
    const input = page.getByTestId(testid);
    await input.fill(values[name]);
  }
}

let requestContext: import("@playwright/test").APIRequestContext;

test.beforeAll(async () => {
  // 独立的 API 上下文（断言真实落库）。容器验收时直连 api，本地默认直连 8000。
  const apiBase =
    process.env.API_BASE_URL ?? process.env.WEB_BASE_URL ?? "http://127.0.0.1:8000";
  requestContext = await request.newContext({ baseURL: apiBase });
});

test.afterAll(async () => {
  await requestContext.dispose();
});

test.describe("真实联调：FastAPI(Decimal) + PostgreSQL + 浏览器", () => {
  test("未舍入比率恰为 10.00%：放行，展示原读数、逐步算式与四位小数比率", async ({ page }) => {
    await page.goto("/");
    await fillReadings(page, { initial: "0.00", peak: "10.00", released: "1.00" });
    await page.getByTestId("submit-button").click();

    const panel = page.getByTestId("result-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-conclusion", "PASS");

    // 原始读数
    await expect(page.getByTestId("show-initial")).toHaveText("0.00");
    await expect(page.getByTestId("show-peak")).toHaveText("10.00");
    await expect(page.getByTestId("show-released")).toHaveText("1.00");

    // 逐步算式
    await expect(page.getByTestId("step-total")).toHaveText("10.00 mL");
    await expect(page.getByTestId("step-permanent")).toHaveText("1.00 mL");
    await expect(page.getByTestId("ratio-display")).toHaveText("10.0000%");
    await expect(page.getByTestId("ratio-raw")).toContainText(/^10(\.0)?%$/);
    await expect(page.getByTestId("conclusion-text")).toContainText("唯一结论：放行");

    // 真实落库
    const resp = await requestContext.get("/api/submissions");
    expect(resp.status()).toBe(200);
    const rows = await resp.json();
    const saved = rows.find(
      (r: { initial: string; peak: string; released: string }) =>
        r.initial === "0.00" && r.peak === "10.00" && r.released === "1.00",
    );
    expect(saved, "有效提交必须保存到 PostgreSQL").toBeTruthy();
    expect(saved.conclusion).toBe("PASS");
    expect(saved.ratio_display).toBe("10.0000");
  });

  test("不带小数点的合法读数：后端规范化后仍即时显示结论（无需刷新）", async ({ page }) => {
    await page.goto("/");
    // 检验员直接输入整数 mL 读数
    await fillReadings(page, { initial: "10", peak: "20", released: "11" });
    await page.getByTestId("submit-button").click();

    const panel = page.getByTestId("result-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-conclusion", "PASS");
    // 不卡在“提交中”，无需刷新即可看到结果
    await expect(page.getByTestId("submit-button")).toBeEnabled();
    // 展示后端规范化的两位小数原读数与算式
    await expect(page.getByTestId("show-initial")).toHaveText("10.00");
    await expect(page.getByTestId("show-peak")).toHaveText("20.00");
    await expect(page.getByTestId("show-released")).toHaveText("11.00");
    await expect(page.getByTestId("step-total")).toHaveText("10.00 mL");
    await expect(page.getByTestId("step-permanent")).toHaveText("1.00 mL");
    await expect(page.getByTestId("ratio-display")).toHaveText("10.0000%");
  });

  test("边界两侧：99.99mL 永久量放行(9.9991%)，100.00mL 不放行(10.0001%)", async ({ page }) => {
    await page.goto("/");

    // 最贴近 10% 边界且不超限的合法两位读数之一：99.99/999.99*100 = 9.9990999…%
    await fillReadings(page, { initial: "0.00", peak: "999.99", released: "99.99" });
    await page.getByTestId("submit-button").click();
    let panel = page.getByTestId("result-panel");
    await expect(panel).toHaveAttribute("data-conclusion", "PASS");
    await expect(page.getByTestId("ratio-display")).toHaveText("9.9991%");
    await expect(page.getByTestId("step-permanent")).toHaveText("99.99 mL");

    // 修改卸压读数：旧结论必须立即清除
    await page.getByTestId(INPUTS.released).fill("100.00");
    await expect(page.getByTestId("result-panel")).toHaveCount(0);
    await expect(page.getByTestId("placeholder")).toBeVisible();

    // 重新提交：100.00/999.99*100 = 10.0001000…% -> 不放行
    await page.getByTestId("submit-button").click();
    panel = page.getByTestId("result-panel");
    await expect(panel).toHaveAttribute("data-conclusion", "FAIL");
    await expect(page.getByTestId("ratio-display")).toHaveText("10.0001%");
    await expect(page.getByTestId("conclusion-text")).toContainText("不放行");
  });

  test("峰值不大于初始值：整次无效，无比率、无 PASS/FAIL、不落库", async ({ page }) => {
    const before = await (await requestContext.get("/api/submissions")).json();

    await page.goto("/");
    await fillReadings(page, { initial: "10.00", peak: "10.00", released: "10.00" });
    await page.getByTestId("submit-button").click();

    await expect(page.getByTestId("invalid-panel")).toBeVisible();
    await expect(page.getByTestId("invalid-message")).toContainText("峰值");
    // 无 PASS/FAIL 结果面板，也不产生任何比率
    await expect(page.getByTestId("result-panel")).toHaveCount(0);
    await expect(page.getByTestId("ratio-display")).toHaveCount(0);
    await expect(page.getByTestId("ratio-raw")).toHaveCount(0);
    // 无效面板上只有“无效 INVALID”徽标，不出现放行/不放行结论
    const badge = page.getByTestId("invalid-panel").getByTestId("conclusion");
    await expect(badge).toHaveText(/无效/);
    await expect(page.getByTestId("invalid-panel")).not.toContainText(/放行/);

    // 数据库记录数不增加
    const after = await (await requestContext.get("/api/submissions")).json();
    expect(after.length).toBe(before.length);
  });

  test("卸压值超出[初始,峰值]区间：无效；改回区间内可重新判定", async ({ page }) => {
    await page.goto("/");
    await fillReadings(page, { initial: "10.00", peak: "20.00", released: "20.01" });
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("invalid-panel")).toBeVisible();
    await expect(page.getByTestId("invalid-message")).toContainText("卸压");

    // 一旦修改读数，无效结论立即消失
    await page.getByTestId(INPUTS.released).fill("11.00");
    await expect(page.getByTestId("invalid-panel")).toHaveCount(0);

    await page.getByTestId("submit-button").click();
    const panel = page.getByTestId("result-panel");
    await expect(panel).toHaveAttribute("data-conclusion", "PASS");
    await expect(page.getByTestId("ratio-display")).toHaveText("10.0000%");
  });

  test("修改任一读数立即清除旧结论，重新提交产生新记录（历史可辨）", async ({ page }) => {
    await page.goto("/");
    await fillReadings(page, { initial: "50.00", peak: "60.00", released: "50.00" });
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("result-panel")).toBeVisible();
    await expect(page.getByTestId("ratio-display")).toHaveText("0.0000%");

    // 改峰值读数 -> 旧结论立即消失
    await page.getByTestId(INPUTS.peak).fill("60.01");
    await expect(page.getByTestId("result-panel")).toHaveCount(0);
    await expect(page.getByTestId("placeholder")).toBeVisible();

    // 重新提交（60.01-50=10.01，永久 0 -> 0% PASS）
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("result-panel")).toBeVisible();
    await expect(page.getByTestId("show-peak")).toHaveText("60.01");

    // 两条记录都留在历史中（最新在前），复核员可以逐条对照
    const rows = page.locator('[data-testid^="history-row-"]');
    await expect(rows.first()).toContainText("60.01"); // 第二次提交（新记录）
    await expect(rows.nth(1)).toContainText("60.00"); // 第一次提交（旧记录）
  });

  test("提交在途时改读数：旧响应到达后不得复活旧结论", async ({ page }) => {
    // 让首个 POST 被路由挂起，直到测试显式放行
    let releaseFirst: (() => void) | null = null;
    const firstPostHeld = new Promise<void>((r) => (releaseFirst = r));
    let first = true;
    await page.route("**/api/submissions", async (route) => {
      if (route.request().method() === "POST" && first) {
        first = false;
        await firstPostHeld;
      }
      await route.continue();
    });

    await page.goto("/");
    await fillReadings(page, { initial: "100.00", peak: "110.00", released: "100.50" });
    await page.getByTestId("submit-button").click();

    // 响应未回，无结论
    await expect(page.getByTestId("submit-button")).toBeDisabled();
    await expect(page.getByTestId("result-panel")).toHaveCount(0);

    // 在途期间改读数 -> 立即回到无结论；放行旧响应
    await page.getByTestId(INPUTS.released).fill("109.00");
    await expect(page.getByTestId("result-panel")).toHaveCount(0);
    releaseFirst!();

    // 等旧响应真正落地，断言它没有把 100.50 的旧 PASS 结论带回来
    await page.waitForResponse(
      (r) => r.url().includes("/api/submissions") && r.request().method() === "POST",
    );
    await page.waitForTimeout(300);
    await expect(page.getByTestId("result-panel")).toHaveCount(0);
    await expect(page.getByTestId("placeholder")).toBeVisible();
    await expect(page.getByTestId("input-released")).toHaveValue("109.00");

    // 重新提交（109/110 = 90% 永久膨胀 -> 不放行），形成与当前输入一致的新结论
    await page.unroute("**/api/submissions");
    await page.getByTestId("submit-button").click();
    const panel = page.getByTestId("result-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-conclusion", "FAIL");
    await expect(page.getByTestId("show-released")).toHaveText("109.00");
    await expect(page.getByTestId("ratio-display")).toHaveText("90.0000%");
  });

  test("本地形态校验：超范围/三位小数读数阻止提交且不发请求", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST") requests.push(req.url());
    });

    await page.goto("/");
    await fillReadings(page, { initial: "1.234", peak: "1000.00", released: "5.00" });
    await page.getByTestId("submit-button").click();

    await expect(page.getByTestId("error-initial")).toContainText("两位小数");
    await expect(page.getByTestId("error-peak")).toContainText("999.99");
    await expect(page.getByTestId("result-panel")).toHaveCount(0);
    await expect(page.getByTestId("invalid-panel")).toHaveCount(0);
    expect(requests, "形态非法时不得发起 POST").toHaveLength(0);
  });

  test("刷新页面后已保存记录仍在历史中（真实持久化）", async ({ page }) => {
    await page.goto("/");
    await fillReadings(page, { initial: "7.00", peak: "77.00", released: "8.00" });
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("result-panel")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("history-panel")).toContainText("7.00");
    await expect(page.getByTestId("history-panel")).toContainText("77.00");
    await expect(page.getByTestId("history-panel")).toContainText("8.00");
  });

  test("唯一结论：每个结果面板只渲染一个结论徽标", async ({ page }) => {
    await page.goto("/");
    await fillReadings(page, { initial: "0.00", peak: "3.00", released: "2.00" });
    await page.getByTestId("submit-button").click();
    const panel = page.getByTestId("result-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("conclusion")).toHaveCount(1);
    await expect(panel.getByTestId("conclusion")).toHaveText("不放行 FAIL");
  });
});
