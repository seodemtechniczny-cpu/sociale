from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import logger
from app.routers import analyze, generate, plan, export, product, graphics

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api", tags=["analyze"])
app.include_router(generate.router, prefix="/api", tags=["generate"])
app.include_router(plan.router, prefix="/api", tags=["plan"])
app.include_router(export.router, prefix="/api", tags=["export"])
app.include_router(product.router, prefix="/api", tags=["product"])
app.include_router(graphics.router, prefix="/api", tags=["graphics"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}


logger.info(f"{settings.app_name} ready")
