-- Paths come from the environment so this file records no machine layout:
-- SCRIPTS is the game's Scripts/ directory, OUT is where the raw dump lands.
-- Both fall back to a standard macOS Steam install and the tool's own
-- reference/raw/ tree, matching src/config.py's defaults.
local function envdir(name, fallback)
	local v = os.getenv(name)
	if v ~= nil and v ~= "" then
		if v:sub(-1) ~= "/" then v = v .. "/" end
		return v
	end
	return fallback
end

local HOME = os.getenv("HOME") or "."
local STEAM = HOME .. "/Library/Application Support/Steam/steamapps/"
local SCRIPTS = envdir("EXTRACT_SCRIPTS_HADES1", STEAM .. "common/Hades/Game.macOS.app/Contents/Resources/Content/Scripts/")
-- arg[1] is this script's own directory, passed in by the caller, so the
-- fallback resolves relative to the tool rather than to the shell's cwd.
local OUT = envdir("EXTRACT_RAW", arg[1] .. "../reference/raw/")

-- Steam's per-app manifest is the only place the installed build id is written.
-- It is read here, before any game data is loaded, so that a run which cannot
-- identify the build fails immediately rather than after doing all the work.
local APPMANIFEST = os.getenv("EXTRACT_APPMANIFEST_HADES1")
if APPMANIFEST == nil or APPMANIFEST == "" then
	APPMANIFEST = STEAM .. "appmanifest_1145360.acf"
end

local function readBuildId(path)
	local f = io.open(path, "r")
	if f == nil then return nil end
	local id = nil
	for line in f:lines() do
		-- Steam writes one `"key"<tab>"value"` pair per line.
		local key, value = line:match('^%s*"([^"]+)"%s*"([^"]*)"%s*$')
		if key == "buildid" then id = value end
	end
	f:close()
	return id
end

local BUILD_ID = readBuildId(APPMANIFEST)
if BUILD_ID == nil then
	error("no build id in " .. APPMANIFEST .. "\n" ..
		"The normalizer reads its file:line citations from the live install " ..
		"while its data comes from this dump, so it has to be able to tell " ..
		"whether the two are the same build. A dump that cannot say which " ..
		"build it came from is one nothing downstream can check, so this " ..
		"stops rather than writing one.")
end

dofile(arg[1] .. "engine_stub.lua")
dofile(arg[1] .. "json_encode.lua")

local function writeFile(name, content)
	local f = assert(io.open(OUT .. name, "w"))
	-- Terminated with a newline: the fixture dumps are committed and compared
	-- byte-for-byte, so what lands on disk has to be a complete text file
	-- rather than one an editor or hook would silently finish later.
	f:write(content, "\n")
	f:close()
end

local okColor, errColor = pcall(dofile_stripbom, SCRIPTS .. "Color.lua")
if not okColor then print("ERROR loading Color.lua: " .. tostring(errColor)) end
print("Color loaded")

local ok, err = pcall(dofile_stripbom, SCRIPTS .. "TraitData.lua")
if not ok then print("ERROR loading TraitData.lua: " .. tostring(err)) end
print("TraitData loaded, top-level keys: " .. (function() local n=0 for _ in pairs(TraitData) do n=n+1 end return n end)())

ok, err = pcall(dofile_stripbom, SCRIPTS .. "LootData.lua")
if not ok then print("ERROR loading LootData.lua: " .. tostring(err)) end
print("LootData loaded")

ok, err = pcall(dofile_stripbom, SCRIPTS .. "GiftData.lua")
if not ok then print("ERROR loading GiftData.lua: " .. tostring(err)) end
print("GiftData loaded")

-- The Mirror of Night. Its talents have no trait record, so the ids that reach
-- a requirement are recoverable nowhere else, and MetaUpgradeOrder states which
-- two of them oppose each other rather than leaving the pairing to be guessed.
ok, err = pcall(dofile_stripbom, SCRIPTS .. "MetaUpgradeData.lua")
if not ok then print("ERROR loading MetaUpgradeData.lua: " .. tostring(err)) end
print("MetaUpgradeData loaded")

print("== Dumping ==")
writeFile("h1_TraitData.json", json_encode_object(TraitData))
writeFile("h1_LootData.json", json_encode_object(LootData or {}))
writeFile("h1_Color.json", json_encode_object(Color or {}))
writeFile("h1_GiftData.json", json_encode_object(GiftData or {}))
writeFile("h1_GiftOrdering.json", json_encode(GiftOrdering or {}))
writeFile("h1_MetaUpgradeData.json", json_encode_object(MetaUpgradeData or {}))
writeFile("h1_MetaUpgradeOrder.json", json_encode(MetaUpgradeOrder or {}))
-- Which build this data came from. Carries no timestamp and no paths: a
-- timestamp would make two dumps of the same build differ, which would cost the
-- drift check its byte comparison over this file, and a path would put somebody's
-- home directory into the tree. What is left changes exactly when the game does,
-- so this file showing up in a drift diff is itself the news that a patch landed.
writeFile("h1_provenance.json", json_encode_object({
	game = "hades1",
	steamAppId = "1145360",
	steamBuildId = BUILD_ID,
}))
print("done, build " .. BUILD_ID)
