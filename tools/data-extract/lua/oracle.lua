-- The games' own value logic, run against the games' own tables.
--
-- The Python resolver reimplements what TraitLogic.lua (Hades II) and
-- TraitScripts.lua (Hades I) do to a trait record before its tooltip is drawn.
-- A reimplementation can be wrong in a way that prints a plausible number, and
-- a number on a card is the one thing in this product nobody can check by
-- looking. So this loads the shipped logic and calls it, and the checker beside
-- it diffs the two.
--
-- `RandomFloat` is pinned rather than seeded, and pinned in two places rather
-- than one. A record can roll twice for one value -- once for the rarity
-- multiplier and once for the base -- and those rolls are independent, so
-- pinning both to the same end samples the diagonal of the box the game can
-- reach instead of its corners. Dionysus's damage reduction is the record that
-- showed it: pinned together it reads 30 and 25, while the game can roll
-- anywhere in 20 to 37.5, which is the band the resolver reports. The rarity
-- multiplier is always the first roll a record makes, so the mode pins that one
-- and every later one separately and the checker runs all four combinations.
--
-- Usage: lua oracle.lua <lua dir> <scripts dir> hades1|hades2 <min|max>-<min|max> <out>

local TOOL, SCRIPTS, GAME, WHICH, OUTFILE = arg[1], arg[2], arg[3], arg[4], arg[5]

dofile(TOOL .. "engine_stub.lua")
dofile(TOOL .. "json_encode.lua")

local FIRST, REST = WHICH:match("^(%a+)-(%a+)$")
local rollIndex = 0
function RandomFloat(a, b)
	if a == nil then return 0 end
	if b == nil then return a end
	rollIndex = rollIndex + 1
	local end_ = (rollIndex == 1) and FIRST or REST
	if end_ == "max" then return b end
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
-- Not stubbed: `Format = "Rarity"` answers a word rather than a number, and
-- the resolver transcribes the table this indexes. Two lines lifted from
-- UpgradeChoiceLogic.lua, which is not loaded here, over the game's own
-- TraitRarityData -- so the table is theirs even though the body is copied.
function GetRarityKey( index, customTable )
	local rarityTable = customTable or TraitRarityData.RarityUpgradeOrder
	return rarityTable[index]
end
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
	Hero = {
		ObjectId = 0, Traits = {}, TraitDictionary = {}, HeroTraitValuesCache = {},
		Health = 50, MaxHealth = 50, Elements = {}, SlottedTraits = {},
		OlympianBoonCount = 0, UniqueGodCount = 0, LastStands = {},
	},
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
	-- The loader names each record before inheriting, and several text paths
	-- concatenate that name while reporting a value. Without it they throw and
	-- the pcall below reads the record as having nothing to check.
	record.Name = id
	for _, parent in ipairs(record.InheritFrom or {}) do
		if type(parent) == "string" and TraitData[parent] then
			resolveInheritance(parent, seen)
			inherit(record, TraitData[parent])
		end
	end
	resolved[id] = true
end
for id in pairs(TraitData) do resolveInheritance(id) end

-- The engine stub answers an unresolved global with a proxy whose every field
-- is another proxy, so GetProcessedValue finds a BaseValue on one and the
-- game's own arithmetic throws on it -- which the pcall below then reads as a
-- record with nothing to check. The dump writes these as the string
-- `<unresolved:...>` and so does this, which is what the resolver reads too.
local function flattenProxies(node, depth)
	if type(node) ~= "table" or depth > 12 then return end
	for key, value in pairs(node) do
		if type(value) == "table" then
			local ref = rawget(value, "__UNRESOLVED_REF__")
			if ref then
				node[key] = "<unresolved:" .. ref .. ">"
			else
				flattenProxies(value, depth + 1)
			end
		end
	end
end
for id in pairs(TraitData) do flattenProxies(TraitData[id], 0) end

if not load(GAME == "hades2" and "TraitLogic.lua" or "TraitScripts.lua") then
	error("the game's trait logic would not load, so there is nothing to check against")
end

-- Hades II collects what it extracts under ExtractData; Hades I merges it back
-- over the record itself, so both are dumped flat and the checker knows which
-- names to look for from the record's own ExtractValues.
local out = {}
-- A record whose logic throws is dropped by the pcall below, which looks
-- exactly like a record with nothing to check. Not hypothetical: a
-- `GetRarityKey` stub returning nil made SetTraitTextData throw on twelve
-- keepsakes, and fifty (record, rarity) pairs went unchecked in silence.
local skipped = {}
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
			-- The rarity multiplier is the first roll of the record, so the
			-- count restarts here rather than at the top of the run.
			rollIndex = 0
			local args = { Unit = CurrentRun.Hero, TraitName = id, ForBoonInfo = true }
			if rarity ~= "__none__" then args.Rarity = rarity end
			local ok, trait = pcall(GetProcessedTraitData, args)
			if ok and type(trait) == "table" and pcall(SetTraitTextData, trait) then
				local flat = {}
				if type(trait.ExtractData) == "table" then
					for k, v in pairs(trait.ExtractData) do
						-- A word as readily as a number: the Rarity format answers
						-- `{$Keywords.<Rarity>}`, and a string the checker cannot
						-- see is a value nothing holds the resolver to.
						if type(v) == "number" or type(v) == "string" then
							flat["ExtractData." .. k] = v
						end
					end
				end
				for k, v in pairs(trait) do
					if type(v) == "number" then flat[k] = v end
				end
				out[id .. "|" .. rarity] = flat
			else
				skipped[#skipped + 1] = id .. "|" .. rarity
			end
		end
	end
end

out["__skipped__"] = skipped

local f = assert(io.open(OUTFILE, "w"))
f:write(json_encode_object(out), "\n")
f:close()
print(GAME .. " " .. WHICH .. ": " .. tostring(#ids) .. " records, "
	.. tostring(#skipped) .. " the logic would not process")
