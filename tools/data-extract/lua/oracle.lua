-- The games' own value logic, run against the games' own tables.
--
-- The Python resolver reimplements what TraitLogic.lua (Hades II) and
-- TraitScripts.lua (Hades I) do to a trait record before its tooltip is drawn.
-- A reimplementation can be wrong in a way that prints a plausible number, and
-- a number on a card is the one thing in this product nobody can check by
-- looking. So this loads the shipped logic and calls it, and the checker beside
-- it diffs the two.
--
-- `RandomFloat` is pinned rather than seeded: both games roll inside a band, so
-- one run at each end gives the two draws the game can make, which is exactly
-- what the resolver reports.
--
-- Usage: lua oracle.lua <lua dir> <scripts dir> hades1|hades2 min|max <out>

local TOOL, SCRIPTS, GAME, WHICH, OUTFILE = arg[1], arg[2], arg[3], arg[4], arg[5]

dofile(TOOL .. "engine_stub.lua")
dofile(TOOL .. "json_encode.lua")

function RandomFloat(a, b)
	if a == nil then return 0 end
	if b == nil then return a end
	if WHICH == "max" then return b end
	return a
end
function RandomInt(a, b) return RandomFloat(a, b) end
function RandomChance() return false end

-- Engine helpers the logic calls while computing a value. Anything that would
-- read the run answers the identity element for its use, so what comes out is
-- the trait on its own -- which is the value the game shows when it offers one.
function DeepCopyTable(t)
	if type(t) ~= "table" then return t end
	local out = {}
	for k, v in pairs(t) do out[k] = DeepCopyTable(v) end
	return setmetatable(out, getmetatable(t))
end
function IsEmpty(t) if t == nil then return true end for _ in pairs(t) do return false end return true end
function TableLength(t) local n = 0 if t then for _ in pairs(t) do n = n + 1 end end return n end
function Contains(t, v) if t then for _, x in pairs(t) do if x == v then return true end end end return false end
function GetFirstKey(t) for k in pairs(t) do return k end end
function CollapseTableAsOrderedKeyValuePairs(t)
	local keys = {}
	for k in pairs(t) do keys[#keys + 1] = k end
	table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
	local out = {}
	for i, k in ipairs(keys) do out[i] = { Key = k, Value = t[k] } end
	return out
end
function CollapseTableOrdered(t)
	local out = {}
	if t then for _, v in ipairs(t) do out[#out + 1] = v end end
	return out
end
function MergeTables(a, b) if b then for k, v in pairs(b) do a[k] = v end end return a end
function DebugAssert() end
function DebugPrint() end
function round(v, p)
	p = p or 0
	local f = 10 ^ p
	return math.floor(v * f + 0.5) / f
end
function GetTotalHeroTraitValue(_, args)
	if args and args.IsMultiplier then return 1 end
	return 0
end
function GetHeroTraitValues() return {} end
function HeroHasTrait() return false end
function GetTraitCount() return 0 end
function GetRunDepth() return 1 end
function CalculateHealingMultiplier() return 1 end
function GetResourceAmount() return 0 end
function IsGodTrait() return false end
function GetUpgradedRarity() return nil end
function GetRarityKey() return nil end
function GetNumMetaUpgrades() return 0 end
function GetTotalStatChange() return 0 end
function CalcEasyModeMultiplier() return 1 end
function GetBaseAmmoReloadTime() return 1 end
function GetMaxHealthUpgradeIncrement(v) return v end
function AreTraitsIdentical() return false end
function GetExtractData(t)
	local out = {}
	if t.ExtractValues then for _, e in pairs(t.ExtractValues) do out[#out + 1] = e end end
	return out
end
function thread() end
function wait() end

CurrentRun = {
	Hero = { ObjectId = 0, Traits = {}, HeroTraitValuesCache = {}, MaxHealth = 50, Elements = {} },
	ResourcesGained = {},
	TotalDamageTaken = 0,
}
GameState = { EasyModeLevel = 0 }
verboseLogging = false

local function load(name)
	local ok, err = pcall(dofile_stripbom, SCRIPTS .. name)
	if not ok then print("skip " .. name .. ": " .. tostring(err)) end
	return ok
end

load("UIData.lua")
load("ColorData.lua")
local base = loadfile_stripbom(SCRIPTS .. "TraitData.lua")
if base then base() end
local pipe = io.popen('ls "' .. SCRIPTS .. '" 2>/dev/null')
local files = {}
for line in pipe:lines() do
	if line:match("^TraitData_.*%.lua$") then files[#files + 1] = line end
end
pipe:close()
table.sort(files)
for _, name in ipairs(files) do load(name) end

-- The engine resolves InheritFrom at load and a plain dofile does not, so it is
-- done here. Top-level keys only, child wins, which is the rule the normalizers
-- already follow -- a deeper merge here would be testing a guess about the
-- engine rather than the value logic this exists to check.
local resolved = {}
local function inherit(child, parent)
	for k, v in pairs(parent) do
		if child[k] == nil then child[k] = DeepCopyTable(v) end
	end
end
local function resolveInheritance(id, seen)
	if resolved[id] then return end
	seen = seen or {}
	if seen[id] then return end
	seen[id] = true
	local record = TraitData[id]
	if type(record) ~= "table" then return end
	for _, parent in ipairs(record.InheritFrom or {}) do
		if type(parent) == "string" and TraitData[parent] then
			resolveInheritance(parent, seen)
			inherit(record, TraitData[parent])
		end
	end
	resolved[id] = true
end
for id in pairs(TraitData) do resolveInheritance(id) end

if not load(GAME == "hades2" and "TraitLogic.lua" or "TraitScripts.lua") then
	error("the game's trait logic would not load, so there is nothing to check against")
end

-- Hades II collects what it extracts under ExtractData; Hades I merges it back
-- over the record itself, so both are dumped flat and the checker knows which
-- names to look for from the record's own ExtractValues.
local out = {}
local ids = {}
for id in pairs(TraitData) do ids[#ids + 1] = id end
table.sort(ids)
for _, id in ipairs(ids) do
	local record = TraitData[id]
	if type(record) == "table" then
		local rarities = { "__none__" }
		if type(record.RarityLevels) == "table" then
			for rarity in pairs(record.RarityLevels) do rarities[#rarities + 1] = rarity end
			table.sort(rarities)
		end
		for _, rarity in ipairs(rarities) do
			local args = { Unit = CurrentRun.Hero, TraitName = id, ForBoonInfo = true }
			if rarity ~= "__none__" then args.Rarity = rarity end
			local ok, trait = pcall(GetProcessedTraitData, args)
			if ok and type(trait) == "table" and pcall(SetTraitTextData, trait) then
				local flat = {}
				if type(trait.ExtractData) == "table" then
					for k, v in pairs(trait.ExtractData) do
						if type(v) == "number" then flat["ExtractData." .. k] = v end
					end
				end
				for k, v in pairs(trait) do
					if type(v) == "number" then flat[k] = v end
				end
				out[id .. "|" .. rarity] = flat
			end
		end
	end
end

local f = assert(io.open(OUTFILE, "w"))
f:write(json_encode_object(out), "\n")
f:close()
print(GAME .. " " .. WHICH .. ": " .. tostring(#ids) .. " records")
