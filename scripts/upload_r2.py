"""Upload ML artifacts to Cloudflare R2."""

import os
from pathlib import Path

import boto3
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
ML_DIR = ROOT / "data" / "ml"

FILES = ["embeddings.json", "predictions.json"]


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
        s3.upload_file(
            str(path),
            bucket,
            name,
            ExtraArgs={"ContentType": "application/json"},
        )
        kb = path.stat().st_size / 1024
        print(f"uploaded {name} ({kb:.0f} KB)")


if __name__ == "__main__":
    main()
