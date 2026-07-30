-- Minimal stand-in for the Hades/Hades II Lua engine, just enough to
-- dofile() the plain-data script files (TraitData*, LootData*, ColorData,
-- GiftData) without errors, so we can walk and dump the resulting tables.
-- This does NOT attempt to run game logic; only load/require-time helper
-- functions actually invoked inside table literals are implemented.

-- ---- helper functions the data files call while building tables ----

function OverwriteTableKeys(target, source)
	for k, v in pairs(source) do
		target[k] = v
	end
	return target
end

function CombineTables(a, b)
	local out = {}
	if a then for k, v in pairs(a) do out[k] = v end end
	if b then for k, v in pairs(b) do out[k] = v end end
	return out
end

function ConcatTableValues(a, b)
	local out = {}
	if a then for _, v in ipairs(a) do out[#out+1] = v end end
	if b then for _, v in ipairs(b) do out[#out+1] = v end end
	return out
end

function ShallowCopyTable(t)
	local out = {}
	if t then for k, v in pairs(t) do out[k] = v end end
	return out
end

function ToLookup(arr)
	local out = {}
	if arr then for _, v in ipairs(arr) do out[v] = true end end
	return out
end

rad = math.rad

-- ---- proxy object for any OTHER undefined global (WeaponSets, Keywords,
-- GameData, EffectData, etc.) so a reference to them doesn't crash the
-- load. We tag it so the JSON dumper can mark it as "unresolved" rather
-- than silently emitting nothing or crashing on a cycle/function value. ----

local ProxyMeta = {}
local function makeProxy(path)
	local p = setmetatable({ __UNRESOLVED_REF__ = path }, ProxyMeta)
	return p
end

ProxyMeta.__index = function(t, k)
	-- Numeric-key access returns nil (not a new proxy). This is required
	-- so that `ipairs(someUndefinedGlobal)` terminates instead of looping
	-- forever (ipairs stops at the first nil; a proxy that always returns
	-- a truthy value for t[i] would spin infinitely). We only care about
	-- resolving dotted string-field chains (WeaponSets.Foo.Bar) for the
	-- "unresolved reference" tag, never numeric/array indexing of unknown
	-- external tables.
	if type(k) ~= "string" then
		return nil
	end
	local base = rawget(t, "__UNRESOLVED_REF__") or "?"
	return makeProxy(base .. "." .. k)
end
ProxyMeta.__call = function(t, ...)
	return t
end
ProxyMeta.__len = function(t) return 0 end
ProxyMeta.__tostring = function(t) return "<unresolved:" .. rawget(t, "__UNRESOLVED_REF__") .. ">" end
ProxyMeta.__concat = function(a, b)
	local as = (type(a) == "table" and tostring(a)) or tostring(a)
	local bs = (type(b) == "table" and tostring(b)) or tostring(b)
	return as .. bs
end
-- Arithmetic on an unresolved reference (e.g. some data does
-- `EffectData.AresStatus.BonusBaseDamageOnInflict * 2`, pulling a numeric
-- constant from a data file we didn't load): treat the proxy as 0 so the
-- expression evaluates instead of erroring. This loses that one derived
-- number, which is fine for the catalog extraction (we're not recomputing
-- gameplay balance values).
ProxyMeta.__add = function(a, b) return 0 end
ProxyMeta.__sub = function(a, b) return 0 end
ProxyMeta.__mul = function(a, b) return 0 end
ProxyMeta.__div = function(a, b) return 0 end
ProxyMeta.__mod = function(a, b) return 0 end
ProxyMeta.__pow = function(a, b) return 0 end
ProxyMeta.__unm = function(a) return 0 end

-- Predeclare the real namespaces we DO care about and want to load for
-- real (these get assigned to directly by the data files, e.g.
-- `LootSetData.Zeus = { ... }`, so the table must exist first).
TraitData = {}
TraitSetData = {}
LootSetData = {}

setmetatable(_G, {
	__index = function(t, k)
		return makeProxy("G." .. tostring(k))
	end,
	__newindex = rawset,
})

-- ---- BOM-safe file loader ----
function loadfile_stripbom(path)
	local f = assert(io.open(path, "rb"))
	local content = f:read("*a")
	f:close()
	if content:sub(1, 3) == "\239\187\191" then
		content = content:sub(4)
	end
	local chunk, err = load(content, "@" .. path)
	if not chunk then
		error("parse error in " .. path .. ": " .. tostring(err))
	end
	return chunk
end

function dofile_stripbom(path)
	local chunk = loadfile_stripbom(path)
	return chunk()
end
