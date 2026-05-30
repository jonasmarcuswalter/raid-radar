#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def copy_dist(project: Path, docs_dir: Path, force: bool) -> None:
    dist = project / "offline-app" / "dist"
    if not dist.exists():
        raise SystemExit(f"Missing build output: {dist}")
    if docs_dir.exists() and any(docs_dir.iterdir()):
        if not force:
            raise SystemExit(f"Docs folder is not empty: {docs_dir}. Re-run with --force to replace it.")
        shutil.rmtree(docs_dir)
    docs_dir.mkdir(parents=True, exist_ok=True)
    shutil.copytree(dist, docs_dir, dirs_exist_ok=True)
    (docs_dir / ".nojekyll").write_text("", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare offline race PWA build output for GitHub Pages.")
    parser.add_argument("--project", default=".", help="Project root containing offline-app/dist.")
    parser.add_argument("--docs", default="docs", help="GitHub Pages output folder.")
    parser.add_argument("--force", action="store_true", help="Replace the docs folder if it already exists.")
    args = parser.parse_args()

    project = Path(args.project).expanduser().resolve()
    docs_dir = (project / args.docs).resolve()
    copy_dist(project, docs_dir, args.force)
    print(f"Copied {project / 'offline-app' / 'dist'} to {docs_dir}")
    print("GitHub Pages source: branch /docs folder.")


if __name__ == "__main__":
    main()
