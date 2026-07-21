"""Map country names (as OMDb reports them) to ISO 3166-1 alpha-2 codes.

OMDb returns country names ("United Kingdom, Canada, United States"); the map
fills countries by ISO code. This is an explicit table rather than a fuzzy
library so the mapping is auditable and stable. Unknown names return None and
callers warn, so a new name surfaces instead of silently dropping.
"""

NAME_TO_ISO: dict[str, str] = {
    "united states": "US",
    "united states of america": "US",
    "usa": "US",
    "united kingdom": "GB",
    "uk": "GB",
    "canada": "CA",
    "japan": "JP",
    "france": "FR",
    "germany": "DE",
    "west germany": "DE",
    "east germany": "DE",
    "australia": "AU",
    "china": "CN",
    "italy": "IT",
    "south korea": "KR",
    "north korea": "KP",
    "new zealand": "NZ",
    "ireland": "IE",
    "belgium": "BE",
    "sweden": "SE",
    "hong kong": "HK",
    "spain": "ES",
    "india": "IN",
    "united arab emirates": "AE",
    "mexico": "MX",
    "austria": "AT",
    "hungary": "HU",
    "czech republic": "CZ",
    "czechia": "CZ",
    "czechoslovakia": "CZ",
    "bulgaria": "BG",
    "denmark": "DK",
    "south africa": "ZA",
    "switzerland": "CH",
    "norway": "NO",
    "argentina": "AR",
    "netherlands": "NL",
    "the netherlands": "NL",
    "thailand": "TH",
    "finland": "FI",
    "iceland": "IS",
    "brazil": "BR",
    "israel": "IL",
    "vietnam": "VN",
    "croatia": "HR",
    "turkey": "TR",
    "russia": "RU",
    "soviet union": "RU",  # map to Russia so historical titles still fill the map
    "serbia": "RS",
    "colombia": "CO",
    "jordan": "JO",
    "cambodia": "KH",
    "singapore": "SG",
    "morocco": "MA",
    "poland": "PL",
    "portugal": "PT",
    "indonesia": "ID",
    "bahamas": "BS",
    "the bahamas": "BS",
    "malta": "MT",
    "cayman islands": "KY",
    "senegal": "SN",
    "romania": "RO",
    "costa rica": "CR",
    "greece": "GR",
    "gambia": "GM",
    "the gambia": "GM",
    "luxembourg": "LU",
    "saudi arabia": "SA",
    "malaysia": "MY",
    "egypt": "EG",
    "ukraine": "UA",
    "taiwan": "TW",
    "bangladesh": "BD",
    "chile": "CL",
    "peru": "PE",
    "philippines": "PH",
    "nigeria": "NG",
    "kenya": "KE",
    "iran": "IR",
    "pakistan": "PK",
    "estonia": "EE",
    "latvia": "LV",
    "lithuania": "LT",
    "slovakia": "SK",
    "slovenia": "SI",
    "georgia": "GE",
    "armenia": "AM",
    "kazakhstan": "KZ",
    "cyprus": "CY",
    "lebanon": "LB",
    "tunisia": "TN",
    "algeria": "DZ",
    "cuba": "CU",
    "venezuela": "VE",
    "uruguay": "UY",
}


def name_to_iso(name: str) -> str | None:
    return NAME_TO_ISO.get(name.strip().lower())


def names_to_iso(country_field: str) -> list[str]:
    """Convert an OMDb Country string ("A, B, C") to a de-duplicated ISO list."""
    out: list[str] = []
    for part in (country_field or "").split(","):
        iso = name_to_iso(part)
        if iso and iso not in out:
            out.append(iso)
    return out
