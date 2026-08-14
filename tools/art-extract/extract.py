"""Crop every icon the catalog asks for out of the game's atlases.

This runs once. The art it reads does not change between patches in any way this
project has observed, and its output is committed -- so unlike the data
extractor beside it, there is no case for re-running it on a schedule and no
reason for it to stay dependency-free. What keeps the shipped set honest is the
verifier, which needs none of this.

    python3 extract.py --game hades1 --scope gods
"""
import argparse
import io
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

import atlas
import pkg
from resolve import Resolver

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(REPO, "apps", "web", "public", "art", "official")
CATALOG = os.path.join(REPO, "packages", "catalog", "data")

STEAM = "~/Library/Application Support/Steam/steamapps/common"
GAMES = {
    "hades1": {
        "content": STEAM + "/Hades/Game.macOS.app/Contents/Resources/Content",
        "package": "/macOS/Packages/GUI.pkg",
    },
    "hades2": {
        "content": STEAM + "/Hades II/Hades II.app/Contents/Resources/Content",
        "package": "/Packages/1080p/GUI.pkg",
    },
}

# The nine Hexes are the one thing a god-attributed filter misses that belongs in
# the set: they are Selene's and she is not a boon god.
HEXES = {
    "SpellTimeSlowTrait", "SpellPolymorphTrait", "SpellLaserTrait",
    "SpellLeapTrait", "SpellPotionTrait", "SpellSummonTrait",
    "SpellMeteorTrait", "SpellTransformTrait", "SpellMoonBeamTrait",
}

# Hades II only, and asked for by element rather than by an `icon` field: no
# record carries one, because an element symbol marks a boon's affinity from the
# outside instead of being that boon's own picture.
ELEMENTS = ("Aether", "Air", "Earth", "Fire", "Water")

# Visually indistinguishable from lossless on this art at a third of the size,
# measured over extracted icons rather than assumed.
QUALITY = 90


def wanted(game, scope):
    """Icon keys to extract, and what asks for each.

    A record's god is what separates a boon from the rest of the trait table --
    hammers, costumes, NPC offerings and weapon traits are attributed to nobody
    and are out of scope, along with Chaos.
    """
    boons = json.load(open(os.path.join(CATALOG, game, "boons.json")))
    gods = json.load(open(os.path.join(CATALOG, game, "gods.json")))
    keys = {}
    if scope in ("all", "boons"):
        for trait_id, record in boons.items():
            god = record.get("god")
            in_scope = trait_id in HEXES or record.get("duoGods") or (god and god != "Chaos")
            if in_scope and record.get("icon"):
                keys.setdefault(record["icon"], []).append(trait_id)
    if scope in ("all", "gods"):
        for name, record in gods.items():
            if record.get("iconKey"):
                keys.setdefault(record["iconKey"], []).append("god:" + name)
    if scope in ("all", "elements") and game == "hades2":
        for element in ELEMENTS:
            keys.setdefault("Element_" + element, []).append("element:" + element)
    return keys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", choices=sorted(GAMES), required=True)
    ap.add_argument("--scope", choices=("all", "boons", "gods", "elements"), default="all")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    import numpy as np
    import texture2ddecoder
    from PIL import Image

    spec = GAMES[args.game]
    content = os.path.expanduser(spec["content"])
    keys = wanted(args.game, args.scope)
    print("%s: %d icon keys in scope" % (args.game, len(keys)))

    sprites = atlas.sprites(content + spec["package"] + "_manifest")
    resolve = Resolver(content, sprites)
    targets, missing = {}, []
    for key in sorted(keys):
        found = resolve(key)
        if found:
            targets[key] = found
        else:
            missing.append(key)
    print("  resolved %d, unresolved %d" % (len(targets), len(missing)))
    for key in missing:
        print("    no sprite for %s (wanted by %s)" % (key, ", ".join(keys[key])))
    if args.dry_run:
        return 0

    print("  decompressing %s ..." % os.path.basename(spec["package"]))
    pages = {t["name"]: t for t in atlas.textures(pkg.decompress(content + spec["package"]))}

    out_dir = os.path.join(OUT, args.game)
    os.makedirs(out_dir, exist_ok=True)
    decoded, written, total_bytes = {}, 0, 0
    for key, sprite in sorted(targets.items()):
        page_name = "bin\\Win\\Atlases\\" + sprite["page"].split("\\")[-1]
        page = pages.get(page_name) or pages.get(sprite["page"])
        if page is None:
            print("    page missing from package: %s" % sprite["page"])
            continue
        if page["fmt"] != atlas.BC7:
            print("    %s is format %d, not handled" % (page_name, page["fmt"]))
            continue
        if page_name not in decoded:
            raw = texture2ddecoder.decode_bc7(page["data"], page["w"], page["h"])
            # The decoder hands back BGRA; the channel order is the whole edit.
            decoded[page_name] = np.frombuffer(raw, np.uint8).reshape(
                page["h"], page["w"], 4
            )[:, :, [2, 1, 0, 3]]
        image = decoded[page_name]
        crop = image[sprite["y"] : sprite["y"] + sprite["h"], sprite["x"] : sprite["x"] + sprite["w"]]
        buf = io.BytesIO()
        Image.fromarray(crop, "RGBA").save(buf, "WEBP", quality=QUALITY, method=6)
        open(os.path.join(out_dir, key + ".webp"), "wb").write(buf.getvalue())
        written += 1
        total_bytes += buf.tell()
    print("  wrote %d files, %.2f MB, into %s" % (written, total_bytes / 1e6, out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
