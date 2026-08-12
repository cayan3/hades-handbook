"""Texture and sprite-rect readers.

Two separate formats sit behind one idea: the .pkg holds whole atlas pages, and
the .pkg_manifest beside it says which rectangle of which page each named sprite
occupies. Neither is any use without the other.
"""
import struct

SECTION = 0xDE
PAGE_NAME = 0xDD
SECTION_MAGIC = bytes.fromhex("7fb1776b")

# One byte per pixel. Every page holding boon or god art uses it; the only
# texture in either game that does not is the main menu portrait, at raw RGBA.
BC7 = 28


def textures(raw):
    """Atlas pages from a decompressed .pkg.

    Each page is an XNB blob whose header gives the surface format and the size.
    The page's own name is the printable run in front of it -- there is no length
    prefix here, unlike the manifest -- so it is read backwards from the magic.
    """
    out, i, n = [], 0, len(raw)
    while True:
        j = raw.find(b"XNBw", i)
        if j < 0:
            return out
        end = j - 4
        start = end
        while start > 0 and 32 <= raw[start - 1] < 127:
            start -= 1
        # A stray digit or two survives the scan back; the name proper begins at
        # the first path component.
        name = raw[start:end].decode("ascii", "replace").lstrip("0123456789")
        total, fmt, w, h, mips, length = struct.unpack_from("<6I", raw, j + 6)
        out.append(
            {
                "name": name,
                "fmt": fmt,
                "w": w,
                "h": h,
                "mips": mips,
                "data": raw[j + 30 : j + 30 + length],
            }
        )
        i = j + 30 + length
        if i >= n:
            return out


def sprites(path):
    """Named sprite rects from a .pkg_manifest.

    Sections each carry a run of sprites and then the page they belong to, which
    is why the page is attached on the way out rather than as it is read.
    """
    d = open(path, "rb").read()
    n = len(d)
    i = 4  # version
    out = []
    while i < n:
        if d[i] != SECTION:
            break
        i += 1
        i += 4  # section size
        if d[i : i + 4] != SECTION_MAGIC:
            raise ValueError("bad section magic at %d" % i)
        i += 8  # magic, then a constant
        count = struct.unpack_from(">I", d, i)[0]
        i += 4
        rows = []
        for _ in range(count):
            length = d[i]
            name = d[i + 1 : i + 1 + length].decode()
            j = i + 1 + length
            x, y, w, h, _, _, ow, oh = struct.unpack_from(">8I", d, j)
            j += 32
            j += 8  # scale, which is 1.0 for everything we take
            j += 1  # flags
            points = struct.unpack_from(">I", d, j)[0]
            j += 4
            # A hull, for the game's own draw call. Skipped, not parsed.
            j += points * 8
            rows.append({"name": name, "x": x, "y": y, "w": w, "h": h, "ow": ow, "oh": oh})
            i = j
        if d[i] != PAGE_NAME:
            raise ValueError("expected a page name at %d" % i)
        i += 1
        length = d[i]
        page = d[i + 1 : i + 1 + length].decode()
        i += 1 + length
        for r in rows:
            r["page"] = page
        out.extend(rows)
    if i != n - 1:
        raise ValueError("manifest walk ended at %d of %d" % (i, n))
    return out
