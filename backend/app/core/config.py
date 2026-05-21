from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Sociale MVP"
    debug: bool = True

    openai_api_key: str = ""
    openai_model: str = "gpt-5.4-mini"
    image_model: str = "gpt-image-2"
    wordpress_url: str = ""
    wordpress_user: str = ""
    wordpress_app_password: str = ""
    frontend_url: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
