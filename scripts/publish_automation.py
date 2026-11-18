"""Publish an automation (workflow file, cover and videos) to a running Nexo through the public API.

    NEXO_API_KEY=nexo_live_... python scripts/publish_automation.py \
        --url https://app.example.com --name "Nome" --description-file descricao.md \
        --file workflow.json --media capa.png --media demo.mp4

The first --media is shown as the card cover. Create the API key in /admin (Chaves de API).
"""
import argparse
import os
import sys
from pathlib import Path

import httpx


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", required=True, help="Base URL of the Nexo API, without a trailing slash")
    parser.add_argument("--name", required=True)
    parser.add_argument("--description-file", required=True, type=Path)
    parser.add_argument("--file", required=True, type=Path, help="Automation file (JSON, ZIP, ...)")
    parser.add_argument("--media", action="append", default=[], type=Path, help="Image or MP4; repeat the flag")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    key = os.environ.get("NEXO_API_KEY")
    if not key and not args.dry_run:
        print("Set NEXO_API_KEY", file=sys.stderr)
        return 2
    files = [("file", (args.file.name, args.file.read_bytes(), "application/json"))]
    for path in args.media:
        kind = "video/mp4" if path.suffix.lower() == ".mp4" else "application/octet-stream"
        files.append(("media", (path.name, path.read_bytes(), kind)))
    data = {"name": args.name, "description": args.description_file.read_text(encoding="utf-8").strip()}
    print(f"{args.name}: {len(files) - 1} media file(s), {sum(len(f[1][1]) for f in files) / 1048576:.1f} MB")
    if args.dry_run:
        return 0
    response = httpx.post(f"{args.url.rstrip('/')}/automations", headers={"Authorization": f"Bearer {key}"},
                          data=data, files=files, timeout=600)
    print(response.status_code, response.text[:500])
    return 0 if response.status_code == 201 else 1


if __name__ == "__main__":
    raise SystemExit(main())
