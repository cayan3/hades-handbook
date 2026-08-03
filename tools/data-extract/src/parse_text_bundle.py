import os
import re
import json

def parse_sjson_text_bundle(path):
    """Parse Supergiant's semi-JSON help/trait text files into
    {id: {"displayName":..., "description":..., "inheritFrom":..., "line":N}}.
    Format looks like this:
      {
        Id = "ZeusWeaponTrait"
        DisplayName = "Lightning Strike"
        Description = "...text with {braces} inside strings..."
      }
    This is erm not valid JSON lol (no commas, `=` not `:`, etc) and Description
    values can contain literal `{`/`}` as UI markup, so we do *not* try to
    brace-match; instead, split on `Id = "..."` boundaries (this is ok bc real
    entries always start w/ the Id field :salute: :salute:).
    """
    # No bundle means no localized names, which is (still) a real state instead
    # of a "failure"; the synthetic fixtures don't actually ship any text files,
    # so the records they produce should have a null name and descriptionRef.
    if not os.path.exists(path):
        return {}

    with open(path, "r", encoding="utf-8-sig") as f:
        text = f.read()

    # locate each "Id = "..."" occurrence and slice the file into chunks (chop chop)
    # The trailing comma is optional bc the file punctuates itself inconsistently:
    # Hades I writes `Id = "X",` twenty-three times & bare everywhere else. Those
    # lines used to not start an entry at all, so the entry went missing AND its
    # fields were read as part of the previous one -- which is worse than losing
    # it, since a preceding entry w/ no DisplayName of its own would take this
    # one's & report a real name against the wrong id (o_0).
    id_pattern = re.compile(r'^\s*Id\s*=\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$', re.MULTILINE)
    matches = list(id_pattern.finditer(text))
    out = {}
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i+1].start() if i+1 < len(matches) else len(text)
        chunk = text[start:end]
        entry_id = m.group(1)
        line_no = text.count("\n", 0, start) + 1

        dn_m = re.search(r'^\s*DisplayName\s*=\s*"((?:[^"\\]|\\.)*)"\s*$', chunk, re.MULTILINE)
        desc_m = re.search(r'^\s*Description\s*=\s*"((?:[^"\\]|\\.)*)"\s*$', chunk, re.MULTILINE)
        inherit_m = re.search(r'^\s*InheritFrom\s*=\s*"((?:[^"\\]|\\.)*)"\s*$', chunk, re.MULTILINE)

        entry = {"line": line_no}
        if dn_m:
            entry["displayName"] = dn_m.group(1)
        if desc_m:
            entry["description"] = desc_m.group(1)
        if inherit_m:
            entry["inheritFrom"] = inherit_m.group(1)

        # last one wins if an id repeats (shouldn't normally happen o_0)
        out[entry_id] = entry
    return out


def resolve_display_name(bundle, entry_id, _depth=0, _seen=None):
    """The name the game shows for an id, following the bundle's own InheritFrom.

    Some entries carry no DisplayName of their own and an InheritFrom pointing
    at the one they borrow. Reading DisplayName alone leaves those null, and a
    null name downstream reads as cut content -- which is how thirty-odd
    perfectly live records came to look like they had no name, when the name
    was one hop away in the same file.

    Depth-limited and cycle-guarded, because nothing stops the bundle pointing
    two entries at each other.
    """
    if _depth > 8:
        return None
    _seen = _seen or set()
    if entry_id in _seen:
        return None
    _seen.add(entry_id)
    entry = bundle.get(entry_id)
    if not isinstance(entry, dict):
        return None
    if entry.get("displayName"):
        return entry["displayName"]
    parent = entry.get("inheritFrom")
    if isinstance(parent, str):
        return resolve_display_name(bundle, parent, _depth + 1, _seen)
    return None


if __name__ == "__main__":
    from config import text_dir

    h1 = parse_sjson_text_bundle(text_dir("hades1") + "HelpText.en.sjson")
    h2 = parse_sjson_text_bundle(text_dir("hades2") + "TraitText.en.sjson")
    print("H1 entries:", len(h1))
    print("H1 sample ZeusWeaponTrait:", h1.get("ZeusWeaponTrait"))
    print("H2 entries:", len(h2))
    print("H2 sample CastAnywhereBoon:", h2.get("CastAnywhereBoon"))
