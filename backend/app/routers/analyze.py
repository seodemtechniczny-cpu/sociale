from fastapi import APIRouter

from app.models.schemas import AnalyzeRequest, AnalyzeResponse
from app.services.scraper import scrape_url
from app.services.ai import generate_teaser

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_url(request: AnalyzeRequest):
    scraped = await scrape_url(str(request.url))
    teaser = await generate_teaser(scraped)
    return AnalyzeResponse(
        url=str(request.url),
        business_type=teaser["business_type"],
        summary=teaser["summary"],
        post_titles=teaser["post_titles"],
        brand_colors=scraped.get("brand_colors", []),
    )
