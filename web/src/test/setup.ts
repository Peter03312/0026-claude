import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// 组件通过全局 fetch 与后端通信；单元测试以 fetch 为唯一接缝（计算逻辑不在前端）。
// 每个测试在 beforeEach 中通过 mockResolvedValueOnce 排队响应。
vi.stubGlobal("fetch", vi.fn());
