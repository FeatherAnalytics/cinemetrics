"""Build the world-map basemap asset from Natural Earth 110m countries.

Downloads ne_110m_admin_0_countries, slims each feature to geometry + a resolved
ISO 3166-1 alpha-2 code + name, rounds coordinates, and writes
web/public/data/countries.geojson. The choropleth fills each country by ISO code,
so this is the only geo asset needed.
"""

import json
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "data" / "countries.geojson"
URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_110m_admin_0_countries.geojson"
)


def resolve_iso(props: dict) -> str:
    # ISO_A2 is "-99" for a few countries (France, Norway, ...); ISO_A2_EH fixes it.
    for key in ("ISO_A2_EH", "ISO_A2"):
        v = (props.get(key) or "").strip()
        if v and v != "-99":
            return v
    return ""


def round_coords(geom, ndigits: int = 2):
    if isinstance(geom, list):
        if geom and isinstance(geom[0], (int, float)):
            return [round(c, ndigits) for c in geom]
        return [round_coords(g, ndigits) for g in geom]
    return geom


def main() -> None:
    raw = requests.get(URL, timeout=60).json()
    features = []
    for f in raw["features"]:
        iso = resolve_iso(f["properties"])
        geom = f.get("geometry")
        if not geom:
            continue
        geom = {"type": geom["type"], "coordinates": round_coords(geom["coordinates"])}
        features.append(
            {
                "type": "Feature",
                "properties": {"iso": iso, "name": f["properties"].get("NAME", "")},
                "geometry": geom,
            }
        )

    out = {"type": "FeatureCollection", "features": features}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.relative_to(ROOT)}: {len(features)} countries ({size_kb:.0f} KB)")

    # Coverage check against the countries present in my data.
    codes = {f["properties"]["iso"] for f in features if f["properties"]["iso"]}
    import csv

    mine: set[str] = set()
    with open(ROOT / "transform" / "seeds" / "film_enrichment.csv", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            for c in row.get("production_countries", "").split(","):
                c = c.strip()
                if c:
                    mine.add(c)
    missing = sorted(mine - codes)
    print(f"my data has {len(mine)} countries; missing from basemap: {missing or 'none'}")


if __name__ == "__main__":
    main()
