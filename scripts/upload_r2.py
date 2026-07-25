"""Upload ML artifacts to Cloudflare R2, gzipped.

The embeddings file is ~4 MB of JSON but compresses ~4.2x, so it is gzipped here
and served with Content-Encoding: gzip — browsers decompress transparently and no
client change is needed. Compressing at upload rather than relying on edge
compression makes the ~1 MB transfer a property of the artifact instead of a
CDN configuration detail that could silently change.
"""

import gzip
import io
import os
from pathlib import Path

import boto3
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
ML_DIR = ROOT / "data" / "ml"

FILES = ["embeddings-v2.json"]


def main() -> None:
    account_id = os.environ.get("R2_ACCOUNT_ID")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("R2_BUCKET_NAME", "cinemetrics-ml")

    if not all([account_id, access_key, secret_key]):
        raise SystemExit("R2 credentials not set. See .env.example.")

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )

    for name in FILES:
        path = ML_DIR / name
        if not path.exists():
            print(f"skipping {name} (not found)")
            continue
        raw = path.read_bytes()
        # mtime=0 keeps the gzip header deterministic, so an unchanged artifact
        # produces identical bytes rather than a spurious diff each run.
        buffer = io.BytesIO()
        with gzip.GzipFile(fileobj=buffer, mode="wb", compresslevel=6, mtime=0) as gz:
            gz.write(raw)
        payload = buffer.getvalue()

        # One day of caching matches the daily update cadence; the client also
        # appends a version query param derived from the dataset, so a new
        # deploy busts the cache immediately.
        s3.put_object(
            Bucket=bucket,
            Key=name,
            Body=payload,
            ContentType="application/json",
            ContentEncoding="gzip",
            CacheControl="public, max-age=86400",
        )
        print(
            f"uploaded {name}: {len(raw) / 1024:.0f} KB -> "
            f"{len(payload) / 1024:.0f} KB gzipped ({len(raw) / len(payload):.1f}x)"
        )


if __name__ == "__main__":
    main()
