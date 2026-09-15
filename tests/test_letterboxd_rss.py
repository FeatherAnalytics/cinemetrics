from pathlib import Path

import ingest.letterboxd as lb

RSS = b"""<?xml version="1.0"?>
<rss xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
<channel>
<item><tmdb:movieId>1</tmdb:movieId><letterboxd:filmTitle>Seen</letterboxd:filmTitle>
<letterboxd:filmYear>2020</letterboxd:filmYear><letterboxd:watchedDate>2026-09-01</letterboxd:watchedDate>
<letterboxd:memberRating>4.0</letterboxd:memberRating><letterboxd:memberLike>Yes</letterboxd:memberLike></item>
<item><tmdb:movieId>2</tmdb:movieId><letterboxd:filmTitle>Again</letterboxd:filmTitle>
<letterboxd:filmYear>2019</letterboxd:filmYear><letterboxd:watchedDate>2026-09-02</letterboxd:watchedDate>
<letterboxd:rewatch>Yes</letterboxd:rewatch></item>
<item><tmdb:movieId>3</tmdb:movieId><letterboxd:filmTitle>No date</letterboxd:filmTitle></item>
</channel></rss>"""


def test_fetch_new_watches_parses_and_filters(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(lb, "get_bytes", lambda *a, **k: RSS)
    log = tmp_path / "film_log.csv"
    log.write_text("tmdb_id,watched_date\n1,2026-09-01\n", encoding="utf-8")

    watches = lb.fetch_new_watches("someone", log)

    assert [w["tmdb_id"] for w in watches] == ["2"]
    assert watches[0]["is_rewatch"] == "true"
    assert watches[0]["my_rating"] == ""
    assert watches[0]["liked"] == ""
