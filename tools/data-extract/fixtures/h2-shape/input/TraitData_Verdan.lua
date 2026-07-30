-- SYNTHETIC FIXTURE -- no real game content. "Verdan" is an invented
-- earth/root-themed god. This file exists so CindraVerdanBloomBoon (the
-- cross-god duo) and CindraReclaimBoon's asymmetric negation target real,
-- resolvable ids rather than more dangling references.
-- NOTE: not in the originally requested file list -- added because the
-- duo/cross-god/asymmetric-negation coverage items need a second real god
-- to point at. See fixtures/README.md.

OverwriteTableKeys( TraitData, {

	VerdanRootBoon =
	{
		Icon = "Boon_Verdan_01",
		InheritFrom = { "VerdanCoreTemplate" },
		Slot = "Melee",
	},
	VerdanBarkBoon =
	{
		Icon = "Boon_Verdan_02",
		InheritFrom = { "VerdanCoreTemplate" },
		Slot = "Secondary",
	},
	VerdanGroveBoon =
	{
		Icon = "Boon_Verdan_03",
		InheritFrom = { "VerdanCoreTemplate" },
		Slot = "Ranged",
	},

	-- Its prerequisite (TraitData.lua's TraitRequirements.VerdanBriarBoon)
	-- references "VerdanPhantomBoon", which is never defined anywhere in
	-- this fixture. Coverage #15 -- the validator must report it dangling.
	VerdanBriarBoon =
	{
		Icon = "Boon_Verdan_08",
		InheritFrom = { "VerdanCoreTemplate" },
	},

} )
