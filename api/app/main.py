"""FastAPI 入口：气瓶水套耐压试验永久膨胀率判定。

- GET  /api/health         健康检查
- POST /api/submissions    校验读数、Decimal 计算并保存**有效**提交
- GET  /api/submissions    列出已保存的有效提交（新记录在前）

读数组合试验无效或字段校验失败都返回 422，且不落库、不产生比率。
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .calc import TestInvalid, evaluate
from .database import Base, engine, get_db
from .models import Submission
from .schemas import ReadingInput, SubmissionOut, collect_invalid_fields


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 空仓库起步：直接由元数据建表（checkfirst 避免重复创建）。
    Base.metadata.create_all(bind=engine)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="气瓶水套耐压试验判定 API", version="1.0.0", lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.exception_handler(TestInvalid)
    async def _test_invalid_handler(_: Request, exc: TestInvalid) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "TEST_INVALID",
                    "message": str(exc),
                    "fields": ["initial", "peak", "released"],
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = exc.errors()
        # Pydantic 自定义 ValueError 的消息以 "Value error, " 开头，去掉它。
        messages = [
            str(e.get("msg", "")).removeprefix("Value error, ") for e in errors
        ]
        message = "；".join(m for m in messages if m) or "读数校验未通过"
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": message,
                    "fields": collect_invalid_fields(errors),
                }
            },
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/submissions", response_model=SubmissionOut, status_code=201)
    def create_submission(
        payload: ReadingInput, db: Session = Depends(get_db)
    ) -> Submission:
        result = evaluate(payload.initial, payload.peak, payload.released)

        row = Submission(
            initial=payload.initial,
            peak=payload.peak,
            released=payload.released,
            total=result["total"],
            permanent=result["permanent"],
            ratio=result["ratio"],
            ratio_display=str(result["ratio_display"]),
            conclusion=result["conclusion"],
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    @app.get("/api/submissions", response_model=list[SubmissionOut])
    def list_submissions(db: Session = Depends(get_db)) -> list[Submission]:
        return list(
            db.execute(select(Submission).order_by(Submission.id.desc())).scalars()
        )

    return app


app = create_app()
