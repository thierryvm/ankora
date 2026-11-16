"""Build the self-hosted WOFF2 subsets described in scripts/fonts/fonts.json.

Run by hand, never in CI and never from package.json. scripts/fonts/README.md has the
pinned tool versions, the download step and the exact commands:

    python -I scripts/fonts/build-fonts.py --sources <dir> --out <new dir>
    python -I scripts/fonts/build-fonts.py --print-css

<dir> holds the upstream files at their upstream paths (e.g. <dir>/ofl/inter/Inter[opsz,wght].ttf).

Guarantees:
- Provenance: each source is read ONCE into memory, its SHA-256 is checked against
  fonts.json, and every output is built from those verified bytes (no second read).
- Pinned tooling: the installed fonttools AND brotli versions must equal fonts.json.
- Reproducible: fonts are opened with recalcTimestamp=False (fontTools otherwise rewrites
  head.modified on every save), so two runs give identical bytes.
- Cache-safe names: an output is written as <name>.<first 8 hex of its SHA-256>.woff2.
  /fonts/ is served immutable for a year, so new bytes always land at a new URL.
- Atomic: everything is written to a temporary sibling directory, renamed to --out only
  once every font and licence is written. --out must not exist yet.

The script reads fonts.json and never writes it: it prints each output's file name, size
and SHA-256 for a maintainer to copy in, and scripts/fonts/__tests__/fonts.test.ts then
holds the committed files, the CSS and the preloads to those values.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import sys
import tempfile
from pathlib import Path

import brotli
import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "fonts.json"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def code_point(token: str) -> int:
    return int(token.strip()[2:], 16)


def parse_range(text: str) -> list[int]:
    points: list[int] = []
    for part in text.split(","):
        start, _, end = part.strip()[2:].partition("-")
        points.extend(range(int(start, 16), int(end or start, 16) + 1))
    return points


def open_font(data: bytes) -> TTFont:
    return TTFont(io.BytesIO(data), recalcTimestamp=False, lazy=False)


def read_verified(path: Path, expected: str, label: str) -> bytes:
    data = path.read_bytes()
    actual = sha256(data)
    if actual != expected:
        sys.exit(f"{label}: SHA-256 {actual} does not match fonts.json ({expected})")
    return data


def build(manifest: dict, output: dict, source: bytes) -> bytes:
    font = open_font(source)

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
            sys.exit(f"{output['name']}: the source already maps {alias}, refusing to alias it")
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

    font.flavor = "woff2"
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def print_css(manifest: dict) -> None:
    """The @font-face block of src/app/globals.css, in fonts.json order."""
    for output in manifest["outputs"]:
        print("@font-face {")
        print(f"  font-family: '{output['family']}';")
        print(f"  src: url('/fonts/{output['file']}') format('woff2');")
        print(f"  font-weight: {output['weight']};")
        print(f"  font-style: {output['style']};")
        print("  font-display: swap;")
        print(f"  unicode-range: {manifest['ranges'][output['range']]};")
        print("}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--sources", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--print-css", action="store_true")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if args.print_css:
        print_css(manifest)
        return
    if args.sources is None or args.out is None:
        parser.error("--sources and --out are required to build")

    for tool, installed in (("fonttools", fontTools.version), ("brotli", brotli.version)):
        wanted = manifest["tools"][tool]
        if installed != wanted:
            sys.exit(f"{tool} {installed} found, fonts.json pins {wanted}")

    if args.out.exists():
        sys.exit(f"{args.out} already exists: pass a new directory")

    sources = {
        key: read_verified(args.sources / src["path"], src["sha256"], f"source {key}")
        for key, src in manifest["sources"].items()
    }
    licences = {
        lic["file"]: read_verified(
            args.sources / lic["upstreamPath"], lic["sha256"], f"licence {lic['family']}"
        )
        for lic in manifest["licences"]
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{args.out.name}-", dir=args.out.parent))
    try:
        for output in manifest["outputs"]:
            print(output["name"])
            data = build(manifest, output, sources[output["source"]])
            digest = sha256(data)
            file = f"{output['name']}.{digest[:8]}.woff2"
            target = staging / file
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            print(f"  file {file}  bytes {len(data)}  sha256 {digest}")
        for file, data in licences.items():
            target = staging / file
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            print(f"{file} copied")
        staging.rename(args.out)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


if __name__ == "__main__":
    main()
