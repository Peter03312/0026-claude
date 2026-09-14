# 一次性验收服务 verify 的镜像。
# 构建上下文为仓库根目录（见 docker-compose.yml），以便同时装入 api 与 web。
# 官方 Playwright 镜像自带 Node 20、Chromium 及系统依赖；再补 Python 3 虚拟环境。
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

# curl：验收脚本健康探测；python3/venv/pip：Playwright jammy 基础镜像不保证
# 自带可用的 venv 工具链（缺 python3-venv 时 `python3 -m venv` 会构建期失败）。
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl ca-certificates \
        python3 python3-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Python 依赖：运行时依赖 + pytest/httpx（验收连栈内 db，无需 pgserver）
COPY api/requirements.txt api/requirements-test.txt /app/api/
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/python -m pip install --upgrade pip \
    && /opt/venv/bin/python -m pip install -r /app/api/requirements-test.txt
ENV PATH="/opt/venv/bin:${PATH}"

# 前端依赖（利用层缓存）
COPY web/package.json web/package-lock.json /app/web/
RUN cd /app/web && npm ci

# 应用与测试源码
COPY api /app/api
COPY web /app/web

COPY verify/run-acceptance.sh /verify/run-acceptance.sh
RUN chmod +x /verify/run-acceptance.sh

CMD ["/verify/run-acceptance.sh"]
