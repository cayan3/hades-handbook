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

print("== Dumping ==")
writeFile("h1_TraitData.json", json_encode_object(TraitData))
writeFile("h1_LootData.json", json_encode_object(LootData or {}))
writeFile("h1_Color.json", json_encode_object(Color or {}))
writeFile("h1_GiftData.json", json_encode_object(GiftData or {}))
writeFile("h1_GiftOrdering.json", json_encode(GiftOrdering or {}))
print("done")
