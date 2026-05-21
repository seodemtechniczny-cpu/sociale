from fastapi import APIRouter

from app.models.schemas import ScrapeProductRequest, ProductData
from app.services.scraper import scrape_product_url

router = APIRouter()


@router.post("/scrape-product", response_model=ProductData)
async def scrape_product(request: ScrapeProductRequest):
    data = await scrape_product_url(str(request.url))
    return ProductData(**data)
