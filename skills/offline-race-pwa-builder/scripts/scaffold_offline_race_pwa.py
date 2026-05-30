#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = SKILL_ROOT / "assets" / "project-template"


def copy_template(target: Path, force: bool) -> None:
    if target.exists() and any(target.iterdir()) and not force:
        raise SystemExit(f"Target is not empty: {target}. Re-run with --force or choose a new folder.")
    target.mkdir(parents=True, exist_ok=True)
    for item in TEMPLATE.iterdir():
        dest = target / item.name
        if item.is_dir():
            if dest.exists() and force:
                shutil.rmtree(dest)
            shutil.copytree(item, dest, dirs_exist_ok=force)
        else:
            shutil.copy2(item, dest)


def main() -> None:
    parser = argparse.ArgumentParser(description="Scaffold the offline race PWA project template.")
    parser.add_argument("--target", required=True, help="Target project directory.")
    parser.add_argument("--force", action="store_true", help="Overwrite template folders in the target.")
    args = parser.parse_args()

    target = Path(args.target).expanduser().resolve()
    copy_template(target, args.force)
    print(f"Scaffolded offline race PWA project at: {target}")
    print("")
    print("Typical next command:")
    print(
        "python3 scripts/build_offline_app.py "
        "--gpx routes/your-route.gpx "
        "--verified data/your-pois.csv "
        "--critical data/your-critical-pois.csv "
        "--segments data/your-segments.csv "
        "--config data/your-app-config.json"
    )


if __name__ == "__main__":
    main()
