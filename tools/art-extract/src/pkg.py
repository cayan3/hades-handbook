"""Reader for the game's .pkg texture archives.

The container is a magic word followed by a run of independently compressed
chunks, each announcing its own compressed length. Nothing in the file says how
many chunks there are, so the only way through is to walk them; a package is
well-formed exactly when that walk lands on the last byte.

The chunk length is what makes this readable. An earlier attempt keyed on LZ4
sequences with a zero match offset, which is illegal and does appear at chunk
ends -- but only as a side effect of a decoder that had already run past the
boundary and was parsing the next chunk's header as if it were compressed data.
Reading the declared length instead removes the guesswork: every package in both
games walks to EOF exactly.
"""

MAGIC = bytes.fromhex("20000007")


def lz4_block(src, start=0):
    """Decompress one LZ4 block. Returns (bytes, offset one past the end).

    Written out rather than taken from a library because it is thirty lines and
    the alternative is a compiled dependency for a format this file already has
    to understand well enough to frame.
    """
    out = bytearray()
    i, n = start, len(src)
    while i < n:
        token = src[i]
        i += 1
        literals = token >> 4
        if literals == 15:
            while True:
                if i >= n:
                    return bytes(out), i
                b = src[i]
                i += 1
                literals += b
                if b != 255:
                    break
        out += src[i : i + literals]
        i += literals
        if i + 2 > n:
            return bytes(out), i
        offset = src[i] | (src[i + 1] << 8)
        i += 2
        # A block's last sequence is literals only, so this is the ordinary end.
        if offset == 0 or offset > len(out):
            return bytes(out), i
        length = token & 0xF
        if length == 15:
            while True:
                if i >= n:
                    return bytes(out), i
                b = src[i]
                i += 1
                length += b
                if b != 255:
                    break
        length += 4
        p = len(out) - offset
        for k in range(length):
            out.append(out[p + k])
    return bytes(out), i


def chunks(data):
    if data[:4] != MAGIC:
        raise ValueError("not a .pkg: magic is %r" % data[:4])
    off, n = 4, len(data)
    while off < n:
        if data[off] != 0x01:
            raise ValueError("bad chunk header at %d: %r" % (off, data[off : off + 5]))
        size = int.from_bytes(data[off + 1 : off + 5], "big")
        yield data[off + 5 : off + 5 + size]
        off += 5 + size
    if off != n:
        raise ValueError("chunk walk ended at %d of %d" % (off, n))


def decompress(path):
    """Whole package, decompressed. Chunks are independent -- a match never
    reaches back into the previous one -- so the outputs simply concatenate."""
    data = open(path, "rb").read()
    out = bytearray()
    for chunk in chunks(data):
        block, _ = lz4_block(chunk, 0)
        out += block
    return bytes(out)
