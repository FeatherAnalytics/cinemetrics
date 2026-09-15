"""Parse Letterboxd RSS feed for new watch entries."""

import csv
from pathlib import Path
from xml.etree.ElementTree import Element

import defusedxml.ElementTree as ET

from ingest.http import get_bytes

NS = {
    "letterboxd": "https://letterboxd.com",
    "tmdb": "https://themoviedb.org",
}


def fetch_new_watches(letterboxd_user: str, existing_log_path: Path) -> list[dict]:
    """Fetch RSS feed and return watches not already in film_log.csv.

    Each returned dict has keys: watched_date, tmdb_id, title, release_year,
    my_rating, star_rating, is_rewatch, liked.
    """
    url = f"https://letterboxd.com/{letterboxd_user}/rss/"
    # Letterboxd resets TLS handshakes now and then; one unretried reset took
    # down a whole nightly run, and everything downstream of it was skipped.
    body = get_bytes(url, attempts=4, timeout=30)
    if not body:
        raise RuntimeError(f"Letterboxd RSS unreachable after 4 attempts: {url}")

    root = ET.fromstring(body)
    items = root.findall(".//item")

    if not items:
        print("WARNING: RSS returned 0 items. Feed may be down.")
        return []

    # Build set of existing (tmdb_id, watched_date) pairs
    existing: set[tuple[str, str]] = set()
    if existing_log_path.exists():
        with existing_log_path.open(encoding="utf-8") as f:
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

        rating_text = (rating_el.text or "").strip() if rating_el is not None else ""
        rating_raw = float(rating_text) if rating_text else 0
        my_rating = rating_raw * 20 if rating_raw else ""
        star_rating = rating_raw if rating_raw else ""

        rewatch_text = (rewatch_el.text or "").strip() if rewatch_el is not None else "No"
        is_rewatch = "true" if rewatch_text == "Yes" else "false"

        # letterboxd:memberLike is the heart. It is stored per row because the
        # feed gives it per row, NOT because it varies between viewings: the
        # heart is a film-level toggle on Letterboxd, and the feed stamps its
        # current state onto every diary entry for that film. Across the 61
        # films here with two or more Letterboxd watches, the value is identical
        # on every entry, while the rating differs on 21 of them.
        #
        # Two things follow. A heart pressed today lands on a viewing from years
        # ago, so early years are not a clean record of what was felt at the
        # time. And "is the heart more stable across a rewatch than the rating"
        # is not a question this column can answer.
        #
        # An absent element means UNKNOWN, not "not liked"; keep that distinction
        # so affection-rate denominators stay honest.
        like_el = item.find("letterboxd:memberLike", NS)
        if like_el is None or not like_el.text:
            liked = ""
        else:
            liked = "true" if like_el.text.strip() == "Yes" else "false"

        def _text(el: Element | None) -> str:
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
                "liked": liked,
            }
        )

    return watches
