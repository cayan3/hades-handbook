import os
import re

def index_keys_at_depth(path, tab_depth):
    """Scan a Lua data file for `<tabs>Identifier = ` declarations at an
    exact tab-indentation depth (1 = top-level table entries, 3 = entries
    nested three tables deep, e.g. Hades I's LinkedUpgrades blocks).
    Returns {identifier: line_number} using the *first* match per key.
    Deliberately doesn't brace-parse bc string values in this codebase contain
    literal '{'/'}' as UI markup; instead, indentation + `Name = ` is a
    reliable, hand-verified signature for these files' declaration style.
    """
    # A file that isn't there contributes no citations (lol). This matters for
    # the per-god file lists (which erm name all of the shipped game's files o_0);
    # synthetic fixtures (by design) only carry the few that are needed for the
    # grammar (if any are missing, it's just "lack of evidence", not an actual
    # like error).
    if not os.path.exists(path):
        return {}

    prefix = "\t" * tab_depth
    pattern = re.compile(
        r'^' + re.escape(prefix) + r'([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\{)?\s*(--.*)?$'
        r'|^' + re.escape(prefix) + r'([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{.*\},?\s*(--.*)?$'
    )
    out = {}
    with open(path, "r", encoding="utf-8-sig") as f:
        for i, line in enumerate(f, start=1):
            m = pattern.match(line.rstrip("\n"))
            if m:
                key = m.group(1) or m.group(4)
                if key not in out:
                    out[key] = i
    return out


def find_key_anywhere(path, key):
    """Fallback for the rare line that isn't tab-indented consistently
    w/ the rest of the file lolol (a few entries in Hades I's TraitData.lua
    use 2-space indent instead of a tab :no_mouth: :no_mouth:). Looks for an
    exact, unambiguous `KeyName = ` declaration line literally anywhere in the
    file lol, and returns the line number (or None if either zero or multiple
    candidates are found o_0).
    """
    pattern = re.compile(r'^\s*' + re.escape(key) + r'\s*=\s*(\{)?\s*(--.*)?$')
    hits = []
    with open(path, "r", encoding="utf-8-sig") as f:
        for i, line in enumerate(f, start=1):
            if pattern.match(line.rstrip("\n")):
                hits.append(i)
    return hits[0] if len(hits) == 1 else None


if __name__ == "__main__":
    from config import scripts_dir

    H2 = scripts_dir("hades2")
    idx = index_keys_at_depth(H2 + "TraitData_Hestia.lua", 1)
    print(len(idx), idx)
