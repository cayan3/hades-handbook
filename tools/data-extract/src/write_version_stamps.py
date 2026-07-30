import json, datetime, plistlib

from config import APPMANIFEST, info_plist, out_dir

OUT = out_dir()

def read_plist(path):
    with open(path, "rb") as f:
        return plistlib.load(f)

def parse_acf(path):
    out = {}
    with open(path) as f:
        for line in f:
            parts = line.strip().split('"')
            if len(parts) >= 5:
                out[parts[1]] = parts[3]
    return out

h1_plist = read_plist(info_plist("hades1"))
h2_plist = read_plist(info_plist("hades2"))
h1_acf = parse_acf(str(APPMANIFEST["hades1"]))
h2_acf = parse_acf(str(APPMANIFEST["hades2"]))

def stamp(name, appid, acf, plist_data, install_dir):
    last_updated = int(acf.get("LastUpdated", 0))
    return {
        "game": name,
        "steamAppId": appid,
        "steamBuildId": acf.get("buildid"),
        "steamLastUpdatedEpoch": last_updated,
        "steamLastUpdatedUtc": datetime.datetime.utcfromtimestamp(last_updated).isoformat() + "Z" if last_updated else None,
        "bundleShortVersion": plist_data.get("CFBundleShortVersionString"),
        "bundleVersion": plist_data.get("CFBundleVersion"),
        "installDir": install_dir,
        "extractedAtUtc": datetime.datetime.utcnow().isoformat() + "Z",
        "source": {
            "steamAppManifest": "steamapps/appmanifest_%s.acf" % appid,
            "infoPlist": "%s/Contents/Info.plist" % install_dir,
        },
    }

h1_stamp = stamp("Hades", "1145360", h1_acf, h1_plist,
                  "Hades/Game.macOS.app")
h2_stamp = stamp("Hades II", "1145350", h2_acf, h2_plist,
                  "Hades II/Hades II.app")

with open(OUT + "hades1/version.json", "w") as f:
    json.dump(h1_stamp, f, indent=1)
with open(OUT + "hades2/version.json", "w") as f:
    json.dump(h2_stamp, f, indent=1)

print(json.dumps(h1_stamp, indent=1))
print(json.dumps(h2_stamp, indent=1))
