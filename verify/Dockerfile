# 一次性验收服务 verify 的镜像。
# 构建上下文为仓库根目录（见 docker-compose.yml），以便同时装入 api 与 web。
# 官方 Playwright 镜像自带 Node 20、Chromium 及系统依赖；再补 Python 3 虚拟环境。
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

# 验收脚本的健康探测需要 curl（playwright 基础镜像默认不带）
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Python 依赖（FastAPI 测试栈）
COPY api/requirements.txt /app/api/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /app/api/requirements.txt
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
