-- SYNTHETIC FIXTURE -- no real game content. Mimics Hades I's
-- MetaUpgradeData.lua: a flat table of pre-run talents that have no trait
-- record of their own, plus MetaUpgradeOrder, which is the only place the
-- game states which two of them oppose each other.
--
-- Two shapes here are the file's own and are the reason this fixture exists:
-- one entry is written with no space before its `=`, and the table carries a
-- row whose members gate nothing at all.

MetaUpgradeData =
{
	BaseMetaUpgrade =
	{
		ResourceName = "LockKeys",
		UnlockCost = 10,
	},

	KindleMetaUpgrade =
	{
		InheritFrom = { "BaseMetaUpgrade", },
		Icon = "MirrorIcon_Kindle",
		Starting = true,
		CostTable = { 20, 80 },
	},

	SmotherMetaUpgrade=
	{
		InheritFrom = { "BaseMetaUpgrade", },
		Icon = "MirrorIcon_Smother",
		Starting = true,
		CostTable = { 60, 120 },
	},

	-- A row that gates nothing the catalog models. It is still emitted: a
	-- player answering the Mirror answers this row too, and a member missing
	-- from the talent table would be quarantined on the next reload.
	TideMetaUpgrade =
	{
		InheritFrom = { "BaseMetaUpgrade", },
		Icon = "MirrorIcon_Tide",
		CostTable = { 40 },
	},

	EbbMetaUpgrade =
	{
		InheritFrom = { "BaseMetaUpgrade", },
		Icon = "MirrorIcon_Ebb",
		CostTable = { 40 },
	},
}

MetaUpgradeOrder =
{
	{ "KindleMetaUpgrade", "SmotherMetaUpgrade" },
	{ "TideMetaUpgrade", "EbbMetaUpgrade" },
}
