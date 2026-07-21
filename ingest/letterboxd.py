"""Parse Letterboxd RSS feed for new watch entries."""

import csv
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

NS = {
    "letterboxd": "https://letterboxd.com",
    "tmdb": "https://themoviedb.org",
}


def fetch_new_watches(letterboxd_user: str, existing_log_path: Path) -> list[dict]:
    """Fetch RSS feed and return watches not already in film_log.csv.

    Each returned dict has keys: watched_date, tmdb_id, title, release_year,
    my_rating, star_rating, is_rewatch.
    """
    url = f"https://letterboxd.com/{letterboxd_user}/rss/"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()

    root = ET.fromstring(resp.text)
    items = root.findall(".//item")

    if not items:
        print("WARNING: RSS returned 0 items. Feed may be down.")
        return []

    # Build set of existing (tmdb_id, watched_date) pairs
    existing: set[tuple[str, str]] = set()
    if existing_log_path.exists():
        with open(existing_log_path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                tid = row.get("tmdb_id", "")
                wd = row.get("watched_date", "")
                if tid and wd:
                    existing.add((tid, wd))

    watches: list[dict] = []
    for item in items:
        tmdb_el = item.find("tmdb:movieId", NS)
        if tmdb_el is None or not tmdb_el.text:
            continue

        tmdb_id = tmdb_el.text.strip()
        title_el = item.find("letterboxd:filmTitle", NS)
        date_el = item.find("letterboxd:watchedDate", NS)
        rating_el = item.find("letterboxd:memberRating", NS)
        year_el = item.find("letterboxd:filmYear", NS)
        rewatch_el = item.find("letterboxd:rewatch", NS)

        watched_date = date_el.text.strip() if date_el is not None and date_el.text else ""
        if not watched_date:
            continue

        if (tmdb_id, watched_date) in existing:
            continue

        has_rating = rating_el is not None and rating_el.text
        rating_raw = float(rating_el.text.strip()) if has_rating else 0
        my_rating = rating_raw * 20 if rating_raw else ""
        star_rating = rating_raw if rating_raw else ""

        has_rewatch = rewatch_el is not None and rewatch_el.text
        rewatch_text = rewatch_el.text.strip() if has_rewatch else "No"
        is_rewatch = "true" if rewatch_text == "Yes" else "false"

        def _text(el: ET.Element | None) -> str:
            return el.text.strip() if el is not None and el.text else ""

        watches.append(
            {
                "watched_date": watched_date,
                "tmdb_id": tmdb_id,
                "title": _text(title_el),
                "release_year": _text(year_el),
                "my_rating": my_rating,
                "star_rating": star_rating,
                "is_rewatch": is_rewatch,
            }
        )

    return watches
