"""Value-coercion helpers consolidated from the ingest scripts.

Each test locks the exact behavior of the original duplicated helpers so the
refactor stays byte-identical.
"""

from ingest.parse import (
    float_or_empty,
    float_or_none,
    int_or_empty,
    int_or_none,
    na_clean,
    na_empty,
    na_none,
)


class TestNaNone:
    """update.py:_na and omdb.py:_na — no strip, None sentinel."""

    def test_none(self):
        assert na_none(None) is None

    def test_empty(self):
        assert na_none("") is None

    def test_na_literal(self):
        assert na_none("N/A") is None

    def test_value_preserved_no_strip(self):
        assert na_none(" N/A ") == " N/A "
        assert na_none("  1,234  ") == "  1,234  "

    def test_plain_value(self):
        assert na_none("Ridley Scott") == "Ridley Scott"


class TestNaEmpty:
    """fetch_candidates.py:_na — no strip, empty-string sentinel."""

    def test_none(self):
        assert na_empty(None) == ""

    def test_empty(self):
        assert na_empty("") == ""

    def test_na_literal(self):
        assert na_empty("N/A") == ""

    def test_value_preserved_no_strip(self):
        assert na_empty(" N/A ") == " N/A "
        assert na_empty("  1,234  ") == "  1,234  "

    def test_plain_value(self):
        assert na_empty("Ridley Scott") == "Ridley Scott"


class TestNaClean:
    """rebuild_enrichment.py:na — str-coerce, strip, empty-string sentinel."""

    def test_none(self):
        assert na_clean(None) == ""

    def test_empty(self):
        assert na_clean("") == ""

    def test_na_literal(self):
        assert na_clean("N/A") == ""

    def test_na_padded_stripped(self):
        assert na_clean(" N/A ") == ""

    def test_strips_whitespace(self):
        assert na_clean("  1,234  ") == "1,234"

    def test_non_str_coerced(self):
        assert na_clean(1234) == "1234"

    def test_plain_value(self):
        assert na_clean("en") == "en"


class TestIntOrEmpty:
    def test_none(self):
        assert int_or_empty(None) == ""

    def test_empty(self):
        assert int_or_empty("") == ""

    def test_na(self):
        assert int_or_empty("N/A") == ""

    def test_no_digits(self):
        assert int_or_empty("abc") == ""

    def test_comma_thousands(self):
        assert int_or_empty("1,234") == "1234"

    def test_currency_and_commas(self):
        assert int_or_empty("$1,000,000") == "1000000"

    def test_runtime_min(self):
        assert int_or_empty("142 min") == "142"

    def test_padded(self):
        assert int_or_empty("  1,234  ") == "1234"

    def test_non_str_int(self):
        assert int_or_empty(1234) == "1234"


class TestFloatOrEmpty:
    def test_none(self):
        assert float_or_empty(None) == ""

    def test_empty(self):
        assert float_or_empty("") == ""

    def test_na(self):
        assert float_or_empty("N/A") == ""

    def test_rating(self):
        assert float_or_empty("8.5") == "8.5"

    def test_non_numeric(self):
        assert float_or_empty("9.0/10") == ""

    def test_comma_not_float(self):
        assert float_or_empty("1,234") == ""

    def test_padded(self):
        assert float_or_empty("  8.5  ") == "8.5"

    def test_non_str_int(self):
        assert float_or_empty(100) == "100.0"


class TestIntOrNone:
    """omdb.py:_int — numeric int|None."""

    def test_none(self):
        assert int_or_none(None) is None

    def test_empty(self):
        assert int_or_none("") is None

    def test_na(self):
        assert int_or_none("N/A") is None

    def test_no_digits(self):
        assert int_or_none("abc") is None

    def test_comma_thousands(self):
        assert int_or_none("1,234") == 1234

    def test_runtime_min(self):
        assert int_or_none("142 min") == 142


class TestFloatOrNone:
    """omdb.py:_float — numeric float|None."""

    def test_none(self):
        assert float_or_none(None) is None

    def test_empty(self):
        assert float_or_none("") is None

    def test_na(self):
        assert float_or_none("N/A") is None

    def test_rating(self):
        assert float_or_none("8.5") == 8.5

    def test_non_numeric(self):
        assert float_or_none("9.0/10") is None

    def test_comma_not_float(self):
        assert float_or_none("1,234") is None
