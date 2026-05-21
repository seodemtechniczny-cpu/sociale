from fastapi import APIRouter

from app.models.schemas import ExportRequest, ExportResponse
from app.services.wordpress import export_to_wordpress

router = APIRouter()


@router.post("/export/wordpress", response_model=ExportResponse)
async def export_wp(request: ExportRequest):
    result = await export_to_wordpress(
        wp_url=request.wp_url,
        wp_user=request.wp_user,
        wp_app_password=request.wp_app_password,
        title=request.title,
        content=request.content,
        excerpt=request.excerpt or "",
        status=request.status,
    )
    return ExportResponse(**result)
