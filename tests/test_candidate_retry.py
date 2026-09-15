"""A candidate counts as finished only once it carries OMDb data.

Before this, fetch_candidates deduplicated on the presence of a tmdb_id alone,
so a row written without its OMDb half was never looked at again. 3,041 of the
10,288 committed candidates were in that state: an imdb_id and not one critic
field between them.

These tests cover the retry path and, just as importantly, what it must not do
— drop rows, duplicate them, or rewrite the seed with nothing to show for it.
"""

import csv
import importlib.util
from pathlib import Path

import pytest

from ingest.csvio import write_rows
from ingest.enrich import CANDIDATE_CSV_COLUMNS, has_omdb_data

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fc = _load("fetch_candidates_retry_mod", "fetch_candidates.py")


def row(tmdb_id: int, **overrides) -> dict[str, str]:
    base = dict.fromkeys(CANDIDATE_CSV_COLUMNS, "")
    base["tmdb_id"] = str(tmdb_id)
    base["title"] = f"Film {tmdb_id}"
    return base | {k: str(v) for k, v in overrides.items()}


def seed(path: Path, rows: list[dict[str, str]]) -> None:
    write_rows(path, rows, CANDIDATE_CSV_COLUMNS, strict=True)


def read(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


@pytest.fixture(autouse=True)
def _reset_omdb_flag():
    fc._OMDB_DOWN.clear()
    yield
    fc._OMDB_DOWN.clear()


# --- what counts as finished -------------------------------------------------


def test_row_with_only_tmdb_metadata_is_unfinished():
    # Genres and runtime fall back to TMDB, so they are populated whether or not
    # OMDb answered and must not be read as evidence that it did.
    assert not has_omdb_data(row(1, genres="Drama", runtime="120", title="X"))


def test_row_with_one_omdb_field_is_finished():
    assert has_omdb_data(row(1, imdb_rating="7.4"))


def test_whitespace_is_not_data():
    assert not has_omdb_data(row(1, director="   "))


def test_unfinished_reports_the_seeds_imdb_id(tmp_path):
    rows = [
        row(10, imdb_id="tt10", imdb_rating="7.4"),  # done
        row(20, imdb_id="tt20"),                     # hollow, OMDb callable
        row(30),                                     # no imdb_id at all
    ]
    assert fc._unfinished(rows) == {20: "tt20", 30: ""}


def test_unfinished_skips_terminal_rows():
    rows = [
        row(1, omdb_status=""),
        row(2, omdb_status="no_imdb_id"),
        row(3, omdb_status="ok", metascore="80"),
        row(4, omdb_status="not_found"),
        row(5, omdb_status="not_a_film"),
    ]
    pending = fc._unfinished(rows)
    assert set(pending.keys()) == {1}


# --- the retry itself --------------------------------------------------------


@pytest.fixture
def wired(tmp_path, monkeypatch):
    """fetch_candidates with the network and the discovery pass stubbed out."""
    path = tmp_path / "candidate_enrichment.csv"
    monkeypatch.setattr(fc, "CANDIDATE_ENRICHMENT", path)
    monkeypatch.setattr(fc, "TMDB_KEY", "t")
    monkeypatch.setattr(fc, "OMDB_KEY", "o")
    monkeypatch.setattr(fc, "_seed_ids", lambda: set())
    monkeypatch.setattr(fc, "_fetch_list", lambda *a, **k: [])
    monkeypatch.setattr(fc, "_existing_tmdb_ids", lambda: {20, 30})
    return path


def test_hollow_row_is_filled_in_place(wired, monkeypatch):
    seed(wired, [row(10, imdb_id="tt10", imdb_rating="7.4"), row(20, imdb_id="tt20")])
    monkeypatch.setattr(
        fc, "_enrich_tmdb",
        lambda tid, **kw: row(tid, imdb_id="tt20", imdb_rating="8.1", director="Someone"),
    )

    fc.main()

    after = read(wired)
    assert [r["tmdb_id"] for r in after] == ["10", "20"], "no rows added or dropped"
    assert after[1]["imdb_rating"] == "8.1"
    assert after[0]["imdb_rating"] == "7.4", "a finished row is not re-fetched"


def test_a_failed_retry_leaves_the_existing_row_alone(wired, monkeypatch):
    seed(wired, [row(20, imdb_id="tt20", title="Keep Me")])
    monkeypatch.setattr(fc, "_enrich_tmdb", lambda tid, **kw: None)

    fc.main()

    assert read(wired) == [row(20, imdb_id="tt20", title="Keep Me")]


def test_a_retry_that_finds_nothing_does_not_rewrite_the_row(wired, monkeypatch):
    """TMDB vote counts move daily; rewriting on no gain is pure diff churn."""
    seed(wired, [row(30, tmdb_votes="100")])
    monkeypatch.setattr(fc, "_enrich_tmdb", lambda tid, **kw: row(tid, tmdb_votes="219"))

    fc.main()

    assert read(wired)[0]["tmdb_votes"] == "100"


def test_new_candidates_are_enriched_before_the_backlog(wired, monkeypatch):
    seed(wired, [row(20, imdb_id="tt20")])
    monkeypatch.setattr(fc, "_fetch_list", lambda *a, **k: [99])

    order: list[int] = []

    def record(tid, **kw):
        order.append(tid)
        return row(tid, imdb_id=f"tt{tid}", imdb_rating="6.0")

    monkeypatch.setattr(fc, "_enrich_tmdb", record)
    fc.main()

    assert order == [99, 20], "the scarce OMDb quota goes to films with no data"
    assert [r["tmdb_id"] for r in read(wired)] == ["20", "99"], "new rows append last"


def test_nothing_enriched_leaves_the_seed_byte_identical(wired, monkeypatch):
    seed(wired, [row(20, imdb_id="tt20")])
    before = wired.read_bytes()
    monkeypatch.setattr(fc, "_enrich_tmdb", lambda tid, **kw: None)

    fc.main()

    assert wired.read_bytes() == before


# --- running out of OMDb quota mid-run ---------------------------------------


def test_quota_exhaustion_skips_a_film_instead_of_writing_it_hollow(tmp_path, monkeypatch):
    """The bug this whole change exists to stop reintroducing.

    A film OMDb could describe, enriched on a night the quota is gone, must not
    land as a row with no critic data.
    """
    monkeypatch.setattr(fc, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(
        fc, "_tmdb_get", lambda *a, **k: {"id": 42, "imdb_id": "tt42", "title": "Late"}
    )

    def rejected(*a, **k):
        raise RuntimeError("rejected the credential (401)")

    monkeypatch.setattr(fc, "omdb_get", rejected)

    with pytest.raises(RuntimeError):
        fc._enrich_tmdb(42)
    assert fc._OMDB_DOWN.is_set()

    # Every later film that needs OMDb is skipped, not asked and not written.
    assert fc._enrich_tmdb(43) is None
    assert fc._enrich_tmdb(44, seed_imdb_id="tt44") is None


def test_a_film_omdb_cannot_answer_for_is_still_written(tmp_path, monkeypatch):
    """No imdb_id means no OMDb call to wait for, so the quota is irrelevant."""
    monkeypatch.setattr(fc, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(fc, "_tmdb_get", lambda *a, **k: {"id": 50, "title": "No IMDb"})
    fc._OMDB_DOWN.set()

    built = fc._enrich_tmdb(50)
    assert built is not None
    assert built["title"] == "No IMDb"
    assert built["omdb_status"] == "no_imdb_id"


def test_enrich_tmdb_marks_series_as_not_a_film(tmp_path, monkeypatch):
    monkeypatch.setattr(fc, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(
        fc, "_tmdb_get",
        lambda *a, **k: {
            "id": 60, "title": "A Show", "imdb_id": "tt60",
            "genres": [], "keywords": {"keywords": []},
        },
    )
    monkeypatch.setattr(
        fc, "_omdb_get",
        lambda imdb_id: {"Response": "True", "Type": "series", "Title": "A Show"},
    )

    built = fc._enrich_tmdb(60)
    assert built is not None
    assert built["omdb_status"] == "not_a_film"


def test_admission_cap_prefers_similar_over_list():
    similar = {10, 20, 30, 40, 50}
    list_ids = [60, 70, 80, 90, 100]
    existing: set[int] = set()
    import scripts.fetch_candidates as fc_mod
    old_max = fc_mod.MAX_ADMIT
    fc_mod.MAX_ADMIT = 3
    try:
        admitted = fc_mod._admit(similar, list_ids, [], existing)
        assert len(admitted) == 3
        assert all(src == "similar" for _, src in admitted)
    finally:
        fc_mod.MAX_ADMIT = old_max


def test_reverify_marks_series_not_a_film_and_movie_ok(tmp_path, monkeypatch):
    import scripts.fetch_candidates as fc_mod
    monkeypatch.setattr(fc_mod, "ROOT", tmp_path)
    cache_dir = tmp_path / "data" / "raw" / "omdb"
    cache_dir.mkdir(parents=True)

    import json
    (cache_dir / "tt1.json").write_text(json.dumps({"Response": "True", "Type": "series"}))
    (cache_dir / "tt2.json").write_text(json.dumps({"Response": "True", "Type": "movie"}))

    rows_to_check = [
        row(1, imdb_id="tt1", omdb_status="ok_legacy", metascore="80"),
        row(2, imdb_id="tt2", omdb_status="ok_legacy", metascore="75"),
    ]
    updated = fc_mod._reverify(rows_to_check, max_calls=10)
    assert updated == 2
    assert rows_to_check[0]["omdb_status"] == "not_a_film"
    assert rows_to_check[1]["omdb_status"] == "ok"


def test_omdb_is_not_called_again_once_it_has_stopped_answering(tmp_path, monkeypatch):
    calls: list[str] = []

    def counted(imdb_id, **k):
        calls.append(imdb_id)
        raise RuntimeError("rejected the credential (401)")

    monkeypatch.setattr(fc, "omdb_get", counted)
    monkeypatch.setattr(fc, "ROOT", tmp_path)

    with pytest.raises(RuntimeError):
        fc._omdb_get("tt1")
    assert fc._omdb_get("tt2") == {}
    assert calls == ["tt1"], "one rejection is enough to stop asking"
