"""Copy the Letterboxd session cookie out of a HAR capture into .env.

The export cookie expires periodically and has to be refreshed by hand. This
avoids the copy-paste step (and avoids the cookie landing in a shell history
or a chat transcript): capture a HAR of a signed-in visit to
letterboxd.com/data/export/, then run

    uv run python scripts/set_export_cookie.py .logs/export-data-logs.json

It reads the Cookie and User-Agent headers from the /data/export/ request and
writes LETTERBOXD_COOKIE / LETTERBOXD_USER_AGENT into .env, replacing any
existing values. Secret values are never printed.

Both must come from the SAME request: cf_clearance is bound to the User-Agent
that earned it, so a mismatched pair silently fails Cloudflare's check.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
TARGET_PATH = "/data/export/"

COOKIE_KEY = "LETTERBOXD_COOKIE"
UA_KEY = "LETTERBOXD_USER_AGENT"


def _header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def extract(har_path: Path) -> tuple[str, str]:
    """Return (cookie, user_agent) from the /data/export/ request in a HAR."""
    har = json.loads(har_path.read_text(encoding="utf-8"))
    entries = har.get("log", {}).get("entries", [])

    matches = [e for e in entries if TARGET_PATH in e.get("request", {}).get("url", "")]
    if not matches:
        raise SystemExit(
            f"no request to {TARGET_PATH} found in {har_path.name}. "
            "Capture a HAR while loading letterboxd.com/data/export/ signed in."
        )

    # Last match: if the capture includes retries, the final one is the one that worked.
    request = matches[-1]["request"]
    cookie = _header(request.get("headers", []), "Cookie")
    user_agent = _header(request.get("headers", []), "User-Agent")

    if not cookie:
        raise SystemExit("the /data/export/ request carried no Cookie header")
    if not user_agent:
        raise SystemExit("the /data/export/ request carried no User-Agent header")
    return cookie, user_agent


def upsert_env(path: Path, values: dict[str, str]) -> None:
    """Write key=value into a .env, replacing existing keys and keeping order."""
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    remaining = dict(values)

    out: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in remaining:
            out.append(f"{key}='{remaining.pop(key)}'")
        else:
            out.append(line)

    if remaining:
        if out and out[-1].strip():
            out.append("")
        out.append("# Letterboxd export session (refresh via scripts/set_export_cookie.py)")
        out.extend(f"{k}='{v}'" for k, v in remaining.items())

    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("har", type=Path, help="path to the HAR capture")
    args = parser.parse_args()

    if not args.har.exists():
        print(f"no such file: {args.har}", file=sys.stderr)
        return 1

    cookie, user_agent = extract(args.har)
    upsert_env(ENV_PATH, {COOKIE_KEY: cookie, UA_KEY: user_agent})

    names = sorted({c.split("=", 1)[0].strip() for c in cookie.split(";") if "=" in c})
    print(f"wrote {COOKIE_KEY} ({len(names)} cookies: {', '.join(names)})")
    print(f"wrote {UA_KEY} ({len(user_agent)} chars)")
    print(f"-> {ENV_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
