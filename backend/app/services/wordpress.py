import requests

from app.core.logging import logger


async def export_to_wordpress(
    wp_url: str,
    wp_user: str,
    wp_app_password: str,
    title: str,
    content: str,
    excerpt: str = "",
    status: str = "draft",
) -> dict:
    """Tworzy post jako draft przez WordPress REST API."""
    endpoint = wp_url.rstrip("/") + "/wp-json/wp/v2/posts"

    logger.info(f"[WP EXPORT] URL: {endpoint}")
    logger.info(f"[WP EXPORT] User: {wp_user}")
    logger.info(f"[WP EXPORT] Title: {title!r}")
    logger.info(f"[WP EXPORT] Status: {status}")

    payload = {
        "title": title,
        "content": content,
        "status": status,
    }
    if excerpt:
        payload["excerpt"] = excerpt

    try:
        resp = requests.post(
            endpoint,
            json=payload,
            auth=(wp_user, wp_app_password),
            timeout=15,
            headers={"User-Agent": "Sociale-MVP/1.0"},
        )
    except requests.ConnectionError:
        logger.error(f"[WP EXPORT] Nie udało się połączyć z {endpoint}")
        return {
            "success": False,
            "post_id": None,
            "post_url": None,
            "message": f"Nie udało się połączyć z {wp_url}. Sprawdź adres strony.",
        }
    except requests.Timeout:
        logger.error(f"[WP EXPORT] Timeout")
        return {
            "success": False,
            "post_id": None,
            "post_url": None,
            "message": "Serwer WordPress nie odpowiedział w czasie. Spróbuj ponownie.",
        }

    logger.info(f"[WP EXPORT] Response status: {resp.status_code}")

    if resp.status_code == 401:
        return {
            "success": False,
            "post_id": None,
            "post_url": None,
            "message": "Nieprawidłowe dane logowania. Sprawdź nazwę użytkownika i hasło aplikacji.",
        }

    if resp.status_code == 404:
        return {
            "success": False,
            "post_id": None,
            "post_url": None,
            "message": "Nie znaleziono WordPress REST API pod tym adresem. Sprawdź URL strony.",
        }

    if resp.status_code not in (200, 201):
        detail = ""
        try:
            detail = resp.json().get("message", resp.text[:200])
        except Exception:
            detail = resp.text[:200]
        logger.error(f"[WP EXPORT] Błąd {resp.status_code}: {detail}")
        return {
            "success": False,
            "post_id": None,
            "post_url": None,
            "message": f"WordPress zwrócił błąd ({resp.status_code}): {detail}",
        }

    data = resp.json()
    post_id = data.get("id")
    post_url = data.get("link", "")

    logger.info(f"[WP EXPORT] Sukces! Post ID: {post_id}, URL: {post_url}")

    return {
        "success": True,
        "post_id": post_id,
        "post_url": post_url,
        "message": f"Szkic został utworzony (draft). ID: {post_id}.",
    }
