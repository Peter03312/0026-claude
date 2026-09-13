"""pytest 配置：所有测试都打真实 PostgreSQL + 真实 HTTP。

运行方式
--------
1. Compose 的 verify 服务：``DATABASE_URL``/``API_BASE_URL`` 指向栈内的
   db / api 服务，测试用 httpx 发真请求；
2. 本地无 Docker 时：不设置 API_BASE_URL，本文件自动用 pgserver 拉起嵌入式
   PostgreSQL 16，并在后台线程中运行真实 uvicorn 进程。

任何一种方式都不使用 mock 或 SQLite 替身。
"""
from __future__ import annotations

import os
import tempfile
import threading
import time
import uuid

import httpx
import psycopg
import pytest
import uvicorn

API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
DATABASE_URL = os.getenv("DATABASE_URL", "")


def _start_embedded_stack() -> tuple[str, str, object]:
    import pgserver

    pgdata = tempfile.mkdtemp(prefix="cylinder-pg-")
    server = pgserver.get_server(pgdata)
    db_name = f"cylinder_{uuid.uuid4().hex[:12]}"
    server.psql(f'CREATE DATABASE "{db_name}";')
    base_uri = server.get_uri(db_name)  # postgresql://postgres:@/<db>?host=...
    sqlalchemy_url = base_uri.replace("postgresql://", "postgresql+psycopg://", 1)

    os.environ["DATABASE_URL"] = sqlalchemy_url

    config = uvicorn.Config(
        "app.main:app", host="127.0.0.1", port=8765, log_level="warning"
    )
    httpd = uvicorn.Server(config)
    thread = threading.Thread(target=httpd.run, daemon=True)
    thread.start()

    deadline = time.time() + 30
    last_exc: Exception | None = None
    with httpx.Client() as probe:
        while time.time() < deadline:
            try:
                if probe.get("http://127.0.0.1:8765/api/health").status_code == 200:
                    break
            except Exception as exc:  # 服务尚未起来
                last_exc = exc
            time.sleep(0.2)
        else:
            raise RuntimeError(f"本地 uvicorn 未启动: {last_exc}")

    return "http://127.0.0.1:8765", base_uri, (server, httpd)


@pytest.fixture(scope="session")
def stack():
    if API_BASE_URL:
        # Compose verify 模式：db 与 api 都由 Compose 提供
        dsn = DATABASE_URL.replace("postgresql+psycopg://", "postgresql://", 1)
        base_url = API_BASE_URL
        handles = None
    else:
        base_url, dsn, handles = _start_embedded_stack()
    yield {"base_url": base_url, "dsn": dsn}
    if handles is not None:
        server, httpd = handles
        httpd.should_exit = True
        server.cleanup()


@pytest.fixture()
def client(stack):
    """每次测试前清空 submissions，返回指向真实 HTTP 服务的同步 Client。"""
    with psycopg.connect(stack["dsn"], autocommit=True) as conn:
        conn.execute("TRUNCATE TABLE submissions RESTART IDENTITY;")

    with httpx.Client(base_url=stack["base_url"], timeout=10) as c:
        yield c
