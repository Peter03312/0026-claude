#!/usr/bin/env bash
# 一次性验收脚本（由 Compose 的 verify 服务执行，正常/失败后容器退出）。
# 三关全过才返回 0：
#   1) pytest        —— FastAPI + Pydantic + 真实 PostgreSQL + 真实 HTTP
#   2) vitest run    —— React/TS 单元与组件（边界输入、结论清除）
#   3) playwright    —— 真浏览器对栈内 web -> api -> db 的端到端联调
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://api:8000}"
WEB_BASE_URL="${WEB_BASE_URL:-http://web:80}"
DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://cylinder:cylinder@db:5432/cylinder}"

echo "== [0/3] 等待 api 服务就绪 =="
for _ in $(seq 1 60); do
  if curl -fsS "${API_BASE_URL}/api/health" >/dev/null 2>&1; then
    echo "api is up"
    break
  fi
  sleep 1
done
curl -fsS "${API_BASE_URL}/api/health" | grep -q '"ok"' || {
  echo "api 健康检查失败" >&2
  exit 1
}

echo "== [1/3] pytest（FastAPI + PostgreSQL，真实 HTTP 联调）=="
cd /app/api
API_BASE_URL="${API_BASE_URL}" DATABASE_URL="${DATABASE_URL}" \
  python -m pytest

echo "== [2/3] Vitest（前端单元与组件测试）=="
cd /app/web
npm run test

echo "== [3/3] Playwright（真浏览器端到端：web -> api -> PostgreSQL）=="
cd /app/web
WEB_BASE_URL="${WEB_BASE_URL}" npx playwright test

echo ""
echo "✅ 验收通过：pytest / vitest / playwright 三关全部成功"
