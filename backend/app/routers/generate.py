from fastapi import APIRouter, HTTPException

from app.models.schemas import GenerateRequest, GenerateResponse, SinglePostRequest, SinglePostResponse
from app.services.ai import generate_content, generate_single_post

router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
async def generate_full_content(request: GenerateRequest):
    try:
        result = await generate_content(request.model_dump())
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return GenerateResponse(**result)


@router.post("/generate/single-post", response_model=SinglePostResponse)
async def generate_single(request: SinglePostRequest):
    try:
        result = await generate_single_post(request.model_dump())
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return SinglePostResponse(**result)
