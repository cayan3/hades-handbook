"""Which sprite an icon key names.

The catalog stores the key the game's own trait data uses -- `Boon_Aphrodite_27`
-- and that is not the name of anything in the atlas. An animation table in the
game's content sits between them, mapping the key to a sprite path. Two special
cases sit on top of it, both found by a key resolving to nothing and then being
chased by hand.
"""
import glob
import re

# The game asks for a boon icon at one of two sizes and the trait data stores
# neither name, so Hades I keys need the suffix put back. Both suffixes point at
# the same sprite in every case checked, and the larger is what a node wants.
SIZE_SUFFIXES = ("", "_Large", "_Small")

# A god's symbol is not in the animation table at all; the key is built from the
# god's name and the sprite lives in a fixed directory.
GOD_KEY = re.compile(r"^BoonSymbol(\w+)$")
GOD_SPRITE = "GUI\\Screens\\BoonSelectSymbols\\%s"

# An element symbol is not in the table either, and unlike everything else it is
# in the atlas several times over -- Fire is there at 18, 33 and 66 pixels, on
# three different pages. The largest is taken, since the leaf lookup below would
# hand back whichever came first.
ELEMENT_KEY = re.compile(r"^Element_(\w+)$")
ELEMENT_SPRITE = "GUI\\Icons\\Element_%s"

# The glyph drawn in an unfilled slot. Not in the animation table either, and
# Hades II packs three sizes of each on three pages, so the largest for the same
# reason the element rule takes it.
SLOT_KEY = re.compile(r"^SlotIcon_(\w+)$")
SLOT_SPRITE = "GUI\\HUD\\PrimaryBoons\\SlotIcon_%s"


def animation_map(content_root):
    """Icon key -> sprite path, from the game's animation tables.

    First definition wins: a key is often declared several times with different
    frame ranges, and they agree on the file.
    """
    out = {}
    for path in glob.glob(content_root + "/Game/Animations/*.sjson"):
        text = open(path, encoding="utf-8", errors="replace").read()
        for block in re.finditer(r"\{[^{}]*\}", text):
            body = block.group()
            name = re.search(r'\bName\s*=\s*"([^"]+)"', body)
            file_path = re.search(r'\bFilePath\s*=\s*"([^"]+)"', body)
            if name and file_path:
                out.setdefault(name.group(1), file_path.group(1))
    return out


class Resolver:
    def __init__(self, content_root, sprites):
        self.animations = animation_map(content_root)
        self.by_name = {s["name"]: s for s in sprites}
        self.by_leaf = {}
        self.biggest = {}
        for s in sprites:
            self.by_leaf.setdefault(s["name"].split("\\")[-1], s)
            best = self.biggest.get(s["name"])
            if best is None or s["w"] * s["h"] > best["w"] * best["h"]:
                self.biggest[s["name"]] = s

    def __call__(self, key):
        for suffix in SIZE_SUFFIXES:
            path = self.animations.get(key + suffix)
            if path:
                found = self.by_name.get(path.replace("/", "\\"))
                if found:
                    return found
        god = GOD_KEY.match(key)
        if god:
            found = self.by_name.get(GOD_SPRITE % god.group(1))
            if found:
                return found
        element = ELEMENT_KEY.match(key)
        if element:
            found = self.biggest.get(ELEMENT_SPRITE % element.group(1))
            if found:
                return found
        slot = SLOT_KEY.match(key)
        if slot:
            found = self.biggest.get(SLOT_SPRITE % slot.group(1))
            if found:
                return found
        # Duo art is named for the pairing and needs no indirection.
        return self.by_leaf.get(key)
