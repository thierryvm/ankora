"""Build the self-hosted WOFF2 subsets described in scripts/fonts/fonts.json.

Run by hand, never in CI and never from package.json. See scripts/fonts/README.md for the
pinned tool versions and the exact commands.

    python -I scripts/fonts/build-fonts.py --sources <dir> --out <empty dir>

<dir> holds the upstream files at their upstream paths (e.g. <dir>/ofl/inter/Inter[opsz,wght].ttf).
Every source is checked against the SHA-256 recorded in fonts.json before it is opened: a
mismatch stops the build. The script reads fonts.json and never writes it; it prints each
output's size and SHA-256 so a maintainer can copy them in, and the test then holds the
committed files to those values.

Outputs are byte-for-byte reproducible: fontTools rewrites head.modified on save unless told
not to, so every font is opened with recalcTimestamp=False.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "fonts.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def code_point(token: str) -> int:
    return int(token.strip()[2:], 16)


def parse_range(text: str) -> list[int]:
    points: list[int] = []
    for part in text.split(","):
        start, _, end = part.strip()[2:].partition("-")
        points.extend(range(int(start, 16), int(end or start, 16) + 1))
    return points


def open_font(data: bytes | Path) -> TTFont:
    stream = io.BytesIO(data) if isinstance(data, bytes) else str(data)
    return TTFont(stream, recalcTimestamp=False, lazy=False)


def build(manifest: dict, output: dict, sources: Path, out_dir: Path) -> Path:
    source = manifest["sources"][output["source"]]
    font = open_font(sources / source["path"])

    if output["pin"]:
        font = instancer.instantiateVariableFont(font, output["pin"])
        # The instancer leaves lazily loaded variation data behind that the subsetter
        # cannot walk; a save/reload round trip materialises it.
        buffer = io.BytesIO()
        font.save(buffer)
        font = open_font(buffer.getvalue())

    for alias, target in output["alias"].items():
        alias_cp, target_cp = code_point(alias), code_point(target)
        if alias_cp in font.getBestCmap():
            sys.exit(f"{output['file']}: the source already maps {alias}, refusing to alias it")
        # Subtables decompiled from one offset share a single dict, so the assignment can
        # already be visible in the next subtable: assign, never test for presence here.
        for table in font["cmap"].tables:
            if table.isUnicode() and target_cp in table.cmap:
                table.cmap[alias_cp] = table.cmap[target_cp]
        print(f"  alias {alias} -> glyph of {target}")

    options = subset.Options()
    options.layout_features = list(output["features"])
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.flavor = "woff2"
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=parse_range(manifest["ranges"][output["range"]]))
    subsetter.subset(font)

    cmap = font.getBestCmap()
    missing = [ch for ch in manifest["required"][output["range"]] if ord(ch) not in cmap]
    if missing:
        listed = ", ".join(f"U+{ord(ch):04X}" for ch in missing)
        print(f"  source lacks required: {listed}")

    target_path = out_dir / output["file"]
    target_path.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(target_path)
    return target_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    wanted = manifest["tools"]["fonttools"]
    if fontTools.version != wanted:
        sys.exit(f"fonttools {fontTools.version} found, fonts.json pins {wanted}")

    for key, source in manifest["sources"].items():
        actual = sha256(args.sources / source["path"])
        if actual != source["sha256"]:
            sys.exit(f"source {key}: SHA-256 {actual} does not match fonts.json")
    for licence in manifest["licences"]:
        actual = sha256(args.sources / licence["upstreamPath"])
        if actual != licence["sha256"]:
            sys.exit(f"licence {licence['family']}: SHA-256 {actual} does not match fonts.json")

    if args.out.exists() and any(args.out.iterdir()):
        sys.exit(f"{args.out} is not empty")

    for output in manifest["outputs"]:
        print(output["file"])
        path = build(manifest, output, args.sources, args.out)
        print(f"  bytes {path.stat().st_size}  sha256 {sha256(path)}")

    for licence in manifest["licences"]:
        target = args.out / licence["file"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((args.sources / licence["upstreamPath"]).read_bytes())
        print(f"{licence['file']} copied")


if __name__ == "__main__":
    main()
