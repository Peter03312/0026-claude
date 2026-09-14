# 气瓶水套耐压试验 · 永久膨胀率判定（React + TS + FastAPI + Pydantic + PostgreSQL）

检验员按 **mL** 录入三次量管读数（初始、保压峰值、卸压稳定），系统以 **Decimal**
精确计算并判定气瓶是否放行。

## 业务规则（全部以后端 Decimal 计算为准）

| 项目 | 公式 / 规则 |
| --- | --- |
| 单条读数 | `0.00`–`999.99`，最多两位小数 |
| 总膨胀量 | `总膨胀量 = 保压峰值读数 − 初始读数` |
| 永久膨胀量 | `永久膨胀量 = 卸压稳定读数 − 初始读数` |
| 永久膨胀率 | `永久膨胀量 ÷ 总膨胀量 × 100`（%） |
| 试验有效条件 | 峰值 **>** 初始；初始 **≤** 卸压值 **≤** 峰值（闭区间） |
| 放行 PASS | **未舍入** 永久膨胀率 `≤ 10.00%` |
| 不放行 FAIL | **未舍入** 永久膨胀率 `> 10.00%` |
| 试验无效 | 不满足有效条件：**不产生比率、不保存记录**，页面只显示“试验无效” |

### 为什么强调“未舍入”

页面同时展示**未舍入比率**（判定依据）与**四位小数显示比率**（仅展示）。
判定比较被等价改写为纯整数/十进制乘法：

```
permanent / total * 100 <= 10   ⇔   permanent * 10 <= total
```

全程没有除法与中间舍入，杜绝“显示值 10.0000 但实际已越界”的错放/错杀。
后端 `test_calc.py` 用亚 0.01 mL 的 Decimal 读数直接验证该规则；真实两位小数
读数下最贴近边界的一对（最大量程）是：

- `0.00 / 999.99 / 99.99` → 9.9990999…%（显示 9.9991）→ **放行**
- `0.00 / 999.99 / 100.00` → 10.0001000…%（显示 10.0001）→ **不放行**

### 修改读数即清除结论

任一输入框内容发生变化，上一次的 PASS/FAIL/无效结论**立即从页面消失**；
只有重新提交、由后端重新计算并落库后，才会形成**新记录**。历史列表按编号
保留每一次有效提交，复核员可逐条对照气瓶究竟是“卡在边界 / 已超限 / 试验本身无效”。

## 目录结构

```
api/                 FastAPI + Pydantic + SQLAlchemy（Decimal 全程）
  app/calc.py        纯 Decimal 判定核心（无浮点）
  app/schemas.py     Pydantic 读数校验（范围/小数位）、Decimal→字符串序列化
  app/models.py      PostgreSQL NUMERIC 模型
  app/main.py        /api/health、POST/GET /api/submissions
  tests/             pytest：真实 HTTP + 真实 PostgreSQL（边界/无效/持久化）
web/                 React 18 + TypeScript + Vite
  src/reading.ts     读数字面量校验（不在前端做业务计算）
  src/components/    录入表单、结果面板、无效面板、历史列表
  src/App.test.tsx   Vitest 组件测试（结论清除、三态、边界输入）
  e2e/               Playwright 真浏览器端到端
verify/              一次性验收服务（pytest + vitest + playwright）
docker-compose.yml   db / api / web 三服务 + verify profile
```

## 快速启动（Docker Compose）

```bash
docker compose up --build
# 前端 http://localhost:8080
# 接口 http://localhost:8000/api/health
```

宿主端口由环境变量覆盖（`.env` 或 shell）：

```bash
WEB_PORT=9000 API_PORT=9001 docker compose up --build
# -> http://localhost:9000 ， http://localhost:9001
```

## 一次性验收（pytest + Vitest + Playwright，真实联调）

```bash
docker compose --profile verify run --build verify
```

`verify` 服务会等待 db/api/web 就绪，然后顺序执行：

1. **pytest**：对 `http://api:8000` 发真实 HTTP 请求，数据落真实 PostgreSQL；
2. **Vitest**：React/TS 单元与组件测试；
3. **Playwright**：容器内真 Chromium 走 `web(nginx) → api(FastAPI) → PostgreSQL`
   端到端，覆盖 10.00% 边界、边界两侧、试验无效（不落库）、改数即清除、
   刷新后持久化等场景。

进程在三关结束后退出，不会常驻。

## 本地无 Docker 时的测试

- 后端：`api/tests/conftest.py` 在未设置 `API_BASE_URL` 时，会用
  [`pgserver`](https://pypi.org/project/pgserver/) 拉起嵌入式 PostgreSQL 16，
  并在线程中运行真实 uvicorn，pytest 全部打真实 HTTP 与真实数据库：

  ```bash
  cd api
  pip install -r requirements-dev.txt   # 运行时依赖 + pytest/httpx/pgserver
  pytest
  ```

- 前端：

  ```bash
  cd web
  npm ci
  npm run test          # Vitest
  npm run test:e2e      # Playwright（需先启动 web 与 api，或让其自动 npm run dev）
  ```
