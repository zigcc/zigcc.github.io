#!/usr/bin/env python3
import argparse
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

API_BASE_URL = "https://api.liujiacai.net/ai/markdown?url="


def extract_slug(url: str) -> str:
    """Extract the last slug from URL path."""
    parsed = urlparse(url.strip())
    path = parsed.path.rstrip("/")
    if not path:
        return "index"
    slug = path.split("/")[-1]
    return slug or "index"


def fetch_url(api_url: str, target_file: Path) -> bool:
    """Fetch markdown content via curl to properly respect system proxy settings."""
    try:
        result = subprocess.run(
            ["curl", "-sSL", "-f", api_url, "-o", str(target_file)],
            check=True,
            capture_output=True,
            text=True,
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"       -> curl error: {e.stderr.strip()}", file=sys.stderr)
        return False


def fetch_and_save(source_file: Path, output_dir: Path) -> None:
    """Read URLs from source_file, call API, and save markdown output."""
    if not source_file.exists():
        print(f"Error: source file not found: {source_file}", file=sys.stderr)
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    with open(source_file, "r", encoding="utf-8") as f:
        urls = [line.strip() for line in f if line.strip() and not line.startswith("#")]

    total = len(urls)
    print(f"Found {total} URLs in {source_file}")

    success_count = 0
    for idx, url in enumerate(urls, 1):
        slug = extract_slug(url)
        target_file = output_dir / f"{slug}.md"
        api_url = f"{API_BASE_URL}{url}"

        print(f"[{idx}/{total}] Fetching {slug} ({url}) ...")
        if fetch_url(api_url, target_file):
            print(f"       -> Saved to {target_file}")
            success_count += 1

    print(f"Done. Successfully saved {success_count}/{total} files.")


def main():
    script_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(
        description="Fetch markdown content from URLs listed in source.txt"
    )
    parser.add_argument(
        "--source",
        "-s",
        type=Path,
        default=script_dir / "source.txt",
        help="Path to source.txt file (default: utils/source.txt)",
    )
    parser.add_argument(
        "--output-dir",
        "-o",
        type=Path,
        default=script_dir / "learning-zig-src",
        help="Directory to save markdown files (default: utils/learning-zig-src)",
    )

    args = parser.parse_args()
    fetch_and_save(args.source, args.output_dir)


if __name__ == "__main__":
    main()
