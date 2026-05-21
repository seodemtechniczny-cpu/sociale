from fastapi import APIRouter, HTTPException

from app.models.schemas import PlanRequest, PlanResponse
from app.services.ai import generate_plan

router = APIRouter()


@router.post("/plan", response_model=PlanResponse)
async def create_plan(request: PlanRequest):
    try:
        result = await generate_plan(request.model_dump())
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return PlanResponse(**result)
