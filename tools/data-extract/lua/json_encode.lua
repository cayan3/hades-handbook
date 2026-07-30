-- Small, dependency-free Lua value -> JSON encoder for dumping loaded
-- data tables. Handles cycles (rare here, since references are ids/strings,
-- not live table links) and tags unresolved proxy objects distinctly.

local function isArray(t)
	local n = 0
	for k, _ in pairs(t) do
		if type(k) ~= "number" then return false end
		n = n + 1
	end
	if n == 0 then return true end -- empty table -> [] (we special-case at call sites where {} should be object)
	for i = 1, n do
		if t[i] == nil then return false end
	end
	return true
end

local escapes = {
	["\""] = "\\\"", ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t",
}

local function encodeString(s)
	local out = s:gsub('[%c"\\]', function(c)
		return escapes[c] or string.format("\\u%04x", c:byte())
	end)
	return '"' .. out .. '"'
end

local function encodeNumber(n)
	if n ~= n then return "0" end -- NaN guard
	if n == math.huge then return "1e999" end
	if n == -math.huge then return "-1e999" end
	if math.type and math.type(n) == "integer" then
		return tostring(n)
	end
	if n == math.floor(n) and math.abs(n) < 1e15 then
		return string.format("%.1f", n)
	end
	return string.format("%.10g", n)
end

local encode

local function encodeTable(t, seen, forceObject)
	seen = seen or {}
	if seen[t] then
		return '"<cycle>"'
	end
	seen[t] = true

	if rawget(t, "__UNRESOLVED_REF__") then
		seen[t] = nil
		return encodeString("<unresolved:" .. rawget(t, "__UNRESOLVED_REF__") .. ">")
	end

	local parts = {}
	if not forceObject and isArray(t) then
		local n = 0
		for _ in pairs(t) do n = n + 1 end
		if n == 0 then
			seen[t] = nil
			return "[]"
		end
		for i = 1, n do
			parts[#parts+1] = encode(t[i], seen)
		end
		seen[t] = nil
		return "[" .. table.concat(parts, ",") .. "]"
	else
		-- stable key order: sort keys as strings for reproducible diffs
		local keys = {}
		for k, _ in pairs(t) do keys[#keys+1] = k end
		table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
		for _, k in ipairs(keys) do
			local v = t[k]
			parts[#parts+1] = encodeString(tostring(k)) .. ":" .. encode(v, seen)
		end
		seen[t] = nil
		if #parts == 0 then return "{}" end
		return "{" .. table.concat(parts, ",") .. "}"
	end
end

encode = function(v, seen)
	local tv = type(v)
	if tv == "nil" then return "null"
	elseif tv == "boolean" then return v and "true" or "false"
	elseif tv == "number" then return encodeNumber(v)
	elseif tv == "string" then return encodeString(v)
	elseif tv == "table" then return encodeTable(v, seen)
	elseif tv == "function" then return encodeString("<function>")
	else return encodeString("<" .. tv .. ">")
	end
end

function json_encode(v)
	return encode(v, {})
end

function json_encode_object(v)
	-- force top-level table to render as an object even if it looks
	-- array-like (e.g. empty, or numeric-keyed with gaps)
	return encodeTable(v, {}, true)
end
