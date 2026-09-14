import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.tsx";
import type { ApiErrorBody, SubmissionOut } from "./types";

function passSubmission(overrides: Partial<SubmissionOut> = {}): SubmissionOut {
  return {
    id: 1,
    initial: "100.00",
    peak: "110.00",
    released: "100.50",
    total: "10.00",
    permanent: "0.50",
    ratio: "5",
    ratio_display: "5.0000",
    conclusion: "PASS",
    created_at: "2026-09-13T08:00:00Z",
    ...overrides,
  };
}

type QueuedResponse = { body: unknown; init?: ResponseInit };
let getQueue: QueuedResponse[];
let postQueue: QueuedResponse[];

function queuePost(body: unknown, init: ResponseInit = {}) {
  postQueue.push({ body, init });
}
function queueGet(body: unknown, init: ResponseInit = {}) {
  getQueue.push({ body, init });
}

async function fillAll(
  user: ReturnType<typeof userEvent.setup>,
  i: string,
  p: string,
  r: string,
) {
  // 顺序操作（并发 userEvent 在 jsdom 下会互相干扰丢键）
  await user.click(screen.getByTestId("input-initial"));
  await user.clear(screen.getByTestId("input-initial"));
  await user.type(screen.getByTestId("input-initial"), i);
  await user.click(screen.getByTestId("input-peak"));
  await user.clear(screen.getByTestId("input-peak"));
  await user.type(screen.getByTestId("input-peak"), p);
  await user.click(screen.getByTestId("input-released"));
  await user.clear(screen.getByTestId("input-released"));
  await user.type(screen.getByTestId("input-released"), r);
}

beforeEach(() => {
  getQueue = [];
  postQueue = [];
  // 按 HTTP 方法分流：POST 用 postQueue（默认 201），GET 用 getQueue（默认空列表）。
  // 这样挂载时的历史 GET 不会误吞为 POST 准备的响应。
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const queued = method === "POST" ? postQueue.shift() : getQueue.shift();
    const body = queued?.body ?? (method === "POST" ? {} : []);
    const status = queued?.init?.status ?? (method === "POST" ? 201 : 200);
    return {
      ok: status < 400,
      status,
      json: async () => body,
    } as Response;
  });
});

afterEach(() => {
  cleanup();
  // 只清调用记录，保留 setup 中通过 stubGlobal 安装的 fetch mock 本体。
  vi.clearAllMocks();
});

describe("App 判定流程（fetch 为接缝，展示与交互全真实）", () => {
  it("放行：展示原读数、逐步算式、四位小数比率与唯一 PASS 结论", async () => {
    const user = userEvent.setup();
    queuePost(passSubmission());
    render(<App />);

    await fillAll(user, "100.00", "110.00", "100.50");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(screen.getByTestId("result-panel")).toBeInTheDocument());
    const panel = screen.getByTestId("result-panel");
    expect(within(panel).getByTestId("conclusion")).toHaveTextContent("放行");
    expect(within(panel).getByTestId("show-initial")).toHaveTextContent("100.00");
    expect(within(panel).getByTestId("show-peak")).toHaveTextContent("110.00");
    expect(within(panel).getByTestId("show-released")).toHaveTextContent("100.50");
    expect(within(panel).getByTestId("step-total")).toHaveTextContent("10.00 mL");
    expect(within(panel).getByTestId("step-permanent")).toHaveTextContent("0.50 mL");
    expect(within(panel).getByTestId("ratio-display")).toHaveTextContent("5.0000%");
    expect(within(panel).getByTestId("ratio-raw")).toHaveTextContent("5%");
    expect(within(panel).getByTestId("conclusion-text")).toHaveTextContent("放行");

    // 请求体逐字符保真，未引入 number
    const postCall = vi.mocked(fetch).mock.calls.find(
      ([, callInit]) => (callInit?.method ?? "GET").toUpperCase() === "POST",
    )!;
    expect(JSON.parse(postCall[1]!.body as string)).toEqual({
      initial: "100.00",
      peak: "110.00",
      released: "100.50",
    });
  });

  it("不放行：显示 FAIL 结论与未舍入比率", async () => {
    const user = userEvent.setup();
    queuePost(
      passSubmission({
        id: 2,
        initial: "0.00",
        peak: "999.99",
        released: "100.00",
        total: "999.99",
        permanent: "100.00",
        ratio: "10.00010000100001000010000100001",
        ratio_display: "10.0001",
        conclusion: "FAIL",
      }),
    );
    render(<App />);
    await fillAll(user, "0.00", "999.99", "100.00");
    await user.click(screen.getByTestId("submit-button"));

    const panel = await screen.findByTestId("result-panel");
    expect(panel).toHaveAttribute("data-conclusion", "FAIL");
    expect(within(panel).getByTestId("conclusion")).toHaveTextContent("不放行");
    expect(within(panel).getByTestId("ratio-display")).toHaveTextContent("10.0001%");
    expect(within(panel).getByTestId("conclusion-text")).toHaveTextContent("不放行");
  });

  it("试验无效：只显示无效面板，不出现比率与 PASS/FAIL 结论", async () => {
    const user = userEvent.setup();
    const body: ApiErrorBody = {
      error: {
        code: "TEST_INVALID",
        message: "峰值读数必须大于初始读数，试验无效",
        fields: ["initial", "peak", "released"],
      },
    };
    queuePost(body, { status: 422 });
    render(<App />);

    await fillAll(user, "10.00", "10.00", "10.00");
    await user.click(screen.getByTestId("submit-button"));

    const invalid = await screen.findByTestId("invalid-panel");
    expect(invalid).toHaveTextContent("试验无效");
    expect(invalid).toHaveTextContent("不产生永久膨胀率");
    expect(screen.queryByTestId("result-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ratio-display")).not.toBeInTheDocument();
  });

  it("修改任一读数立即清除旧结论，重新提交后才出现新结论", async () => {
    const user = userEvent.setup();
    queuePost(passSubmission());
    render(<App />);

    await fillAll(user, "100.00", "110.00", "100.50");
    await user.click(screen.getByTestId("submit-button"));
    expect(await screen.findByTestId("result-panel")).toBeInTheDocument();

    // 改一个字符 -> 旧结论立即消失，占位文案回来
    await user.type(screen.getByTestId("input-peak"), "0");
    expect(screen.queryByTestId("result-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("placeholder")).toBeInTheDocument();

    // 重新提交 -> 形成新记录 #3
    await user.clear(screen.getByTestId("input-peak"));
    await user.type(screen.getByTestId("input-peak"), "110.00");
    queuePost(passSubmission({ id: 3 }));
    await user.click(screen.getByTestId("submit-button"));
    const panel = await screen.findByTestId("result-panel");
    expect(within(panel).getByText(/#3/)).toBeInTheDocument();
  });

  it("提交在途时修改读数：旧响应返回后不得复活旧结论（输入与结论一致）", async () => {
    const user = userEvent.setup();

    // 第一次 POST 挂起，由测试在适当时机放行
    let releasePost: (r: Response) => void = () => {};
    const pendingPost = new Promise<Response>((resolve) => {
      releasePost = resolve;
    });
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        return pendingPost;
      }
      return { ok: true, status: 200, json: async () => [] } as Response;
    });

    render(<App />);
    await fillAll(user, "100.00", "110.00", "100.50");
    await user.click(screen.getByTestId("submit-button"));

    // 在途：按钮显示提交中，尚无结论
    await waitFor(() => expect(screen.getByTestId("submit-button")).toBeDisabled());
    expect(screen.queryByTestId("result-panel")).not.toBeInTheDocument();

    // 检验员在响应返回前改了卸压读数（改为 109.00，接近全膨胀）
    await user.clear(screen.getByTestId("input-released"));
    await user.type(screen.getByTestId("input-released"), "109.00");

    // 旧读数(100.50 -> PASS)的响应这时才返回
    releasePost({
      ok: true,
      status: 201,
      json: async () => passSubmission(),
    } as Response);
    await new Promise((res) => setTimeout(res, 50));

    // 旧结论绝不能重新冒出；页面保持无结论、等待重新提交
    expect(screen.queryByTestId("result-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("placeholder")).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).not.toBeDisabled();
    expect(screen.getByTestId("input-released")).toHaveValue("109.00");
  });

  it("无效结论在修改读数时也立即清除", async () => {
    const user = userEvent.setup();
    const body: ApiErrorBody = {
      error: {
        code: "TEST_INVALID",
        message: "卸压稳定读数必须位于初始读数与峰值读数之间，试验无效",
        fields: ["initial", "peak", "released"],
      },
    };
    queuePost(body, { status: 422 });
    render(<App />);

    await fillAll(user, "10.00", "20.00", "9.99");
    await user.click(screen.getByTestId("submit-button"));
    expect(await screen.findByTestId("invalid-panel")).toBeInTheDocument();

    await user.type(screen.getByTestId("input-released"), "5");
    expect(screen.queryByTestId("invalid-panel")).not.toBeInTheDocument();
  });

  it("本地形态校验：三位小数与超范围读数不发起请求", async () => {
    const user = userEvent.setup();
    render(<App />);
    const callsBefore = vi.mocked(fetch).mock.calls.length;

    await fillAll(user, "1.234", "1000.00", "5.00");
    await user.click(screen.getByTestId("submit-button"));

    expect(screen.getByTestId("error-initial")).toHaveTextContent("两位小数");
    expect(screen.getByTestId("error-peak")).toHaveTextContent("999.99");
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
    expect(screen.queryByTestId("result-panel")).not.toBeInTheDocument();
  });

  it("空字段阻止提交并提示", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("submit-button"));
    expect(screen.getByTestId("error-initial")).toHaveTextContent("请输入读数");
    expect(screen.getByTestId("error-peak")).toHaveTextContent("请输入读数");
    expect(screen.getByTestId("error-released")).toHaveTextContent("请输入读数");
  });

  it("边界 0.00 / 999.99 可提交，四位小数比率显示 0.0000 且放行", async () => {
    const user = userEvent.setup();
    queuePost(
      passSubmission({
        initial: "0.00",
        peak: "999.99",
        released: "0.00",
        total: "999.99",
        permanent: "0.00",
        ratio: "0",
        ratio_display: "0.0000",
      }),
    );
    render(<App />);
    await fillAll(user, "0.00", "999.99", "0.00");
    await user.click(screen.getByTestId("submit-button"));
    const panel = await screen.findByTestId("result-panel");
    expect(within(panel).getByTestId("ratio-display")).toHaveTextContent("0.0000%");
  });

  it("历史列表渲染已保存记录，且无效试验不会进入列表", async () => {
    const item = passSubmission();
    const user = userEvent.setup();
    queuePost(item);
    // 挂载时的历史 GET 返回空；提交成功后刷新历史的 GET 返回该记录
    queueGet([]);
    queueGet([item]);
    render(<App />);

    await fillAll(user, "100.00", "110.00", "100.50");
    await user.click(screen.getByTestId("submit-button"));
    await screen.findByTestId("result-panel");
    expect(await screen.findByTestId("history-row-1")).toBeInTheDocument();
  });
});
