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
local SCRIPTS = envdir("EXTRACT_SCRIPTS_HADES2", STEAM .. "common/Hades II/Hades II.app/Contents/Resources/Content/Scripts/")
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

-- Per-god / per-mechanic files are discovered from the directory rather than
-- listed, for the same reason the normalizer discovers them: a patch that adds
-- a god must be absorbed by re-running this, and a hardcoded list would skip
-- the new file in silence. Sorted so the dump is deterministic, since later
-- files overwrite earlier keys.
local function listFiles(dir, prefix)
	local names = {}
	local pipe = io.popen('ls "' .. dir .. '" 2>/dev/null')
	if pipe == nil then return names end
	for line in pipe:lines() do
		if line:match("^" .. prefix .. "_.*%.lua$") then names[#names + 1] = line end
	end
	pipe:close()
	table.sort(names)
	return names
end


-- 1. Color
local okColor, errColor = pcall(dofile_stripbom, SCRIPTS .. "ColorData.lua")
if not okColor then print("ERROR loading ColorData.lua: " .. tostring(errColor)) end
print("Color loaded, entries: " .. (function() local n=0 for _ in pairs(Color) do n=n+1 end return n end)())

-- 2. Base TraitData.lua (defines TraitRequirements, LinkedTraitData, and
-- merges base trait archetypes into the pre-declared TraitData table)
local baseTraitChunk = loadfile_stripbom(SCRIPTS .. "TraitData.lua")
baseTraitChunk()
print("Base TraitData.lua loaded")

-- 3. All per-god / mechanic TraitData_*.lua files
local traitFiles = listFiles(SCRIPTS, "TraitData")
for _, fname in ipairs(traitFiles) do
	local ok, err = pcall(dofile_stripbom, SCRIPTS .. fname)
	if not ok then
		print("ERROR loading " .. fname .. ": " .. tostring(err))
	else
		print("loaded " .. fname)
	end
end

-- 4. Base LootData.lua then per-god LootData_*.lua
LootSetData.Loot = nil -- will be set by file
local okLoot, errLoot = pcall(dofile_stripbom, SCRIPTS .. "LootData.lua")
if not okLoot then print("ERROR loading LootData.lua: " .. tostring(errLoot)) end
print("Base LootData.lua loaded")

local lootFiles = listFiles(SCRIPTS, "LootData")
for _, fname in ipairs(lootFiles) do
	local ok, err = pcall(dofile_stripbom, SCRIPTS .. fname)
	if not ok then
		print("ERROR loading " .. fname .. ": " .. tostring(err))
	else
		print("loaded " .. fname)
	end
end

-- 5. GiftData.lua (keepsake <-> NPC association)
local ok, err = pcall(dofile_stripbom, SCRIPTS .. "KeepsakeData.lua")
if not ok then print("ERROR loading KeepsakeData.lua: " .. tostring(err)) end

print("== Dumping ==")
writeFile("h2_TraitData.json", json_encode_object(TraitData))
writeFile("h2_TraitSetData.json", json_encode_object(TraitSetData or {}))
writeFile("h2_LootSetData.json", json_encode_object(LootSetData or {}))
writeFile("h2_Color.json", json_encode_object(Color or {}))
writeFile("h2_LinkedTraitData.json", json_encode_object(LinkedTraitData or {}))
writeFile("h2_TraitRequirements.json", json_encode_object(TraitRequirements or {}))
writeFile("h2_GiftData.json", json_encode_object(GiftData or {}))
print("done")
