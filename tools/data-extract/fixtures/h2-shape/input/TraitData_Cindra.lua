-- SYNTHETIC FIXTURE -- no real game content. Mimics one Hades-II-style
-- per-god file. "Cindra" is an invented fire/ember-themed god.

OverwriteTableKeys( TraitData, {

	-- Three core boons (weapon/special/cast-equivalent slots). Their
	-- element affinity and RarityLevels both arrive via the two-level
	-- InheritFrom chain declared in TraitData.lua (coverage #6).
	CindraStrikeBoon =
	{
		Icon = "Boon_Cindra_01",
		InheritFrom = { "CindraCoreTemplate" },
		Slot = "Melee",
	},
	CindraFlareBoon =
	{
		Icon = "Boon_Cindra_02",
		InheritFrom = { "CindraCoreTemplate" },
		Slot = "Secondary",
	},
	CindraWardenBoon =
	{
		Icon = "Boon_Cindra_03",
		InheritFrom = { "CindraCoreTemplate" },
		Slot = "Ranged",
	},

	-- Mid-tier boon requiring one of Cindra's own core boons (its
	-- prerequisite lives in TraitData.lua's TraitRequirements, not here).
	CindraEmberBoon =
	{
		Icon = "Boon_Cindra_04",
		InheritFrom = { "CindraCoreTemplate" },
	},

	-- Legendary capstone (rarity/tier arrive via LegendaryTraitTemplate;
	-- prerequisite lives in TraitData.lua's TraitRequirements).
	CindraPyreBoon =
	{
		Icon = "Boon_Cindra_09",
		InheritFrom = { "LegendaryTraitTemplate", "EmberAffinityBase" },
	},

	-- Symmetric HasNone clique of THREE traits: each one lists the other
	-- two. Coverage #8 -- must collapse to one exclusiveGroup of all three.
	CindraArcCastBoon =
	{
		Icon = "Boon_Cindra_10",
		InheritFrom = { "BaseTraitTemplate" },
		GameStateRequirements =
		{
			{
				Path = { "CurrentRun", "Hero", "TraitDictionary" },
				HasNone = { "CindraLobCastBoon", "CindraEchoCastBoon" },
			},
		},
	},
	CindraLobCastBoon =
	{
		Icon = "Boon_Cindra_11",
		InheritFrom = { "BaseTraitTemplate" },
		GameStateRequirements =
		{
			{
				Path = { "CurrentRun", "Hero", "TraitDictionary" },
				HasNone = { "CindraArcCastBoon", "CindraEchoCastBoon" },
			},
		},
	},
	CindraEchoCastBoon =
	{
		Icon = "Boon_Cindra_12",
		InheritFrom = { "BaseTraitTemplate" },
		GameStateRequirements =
		{
			{
				Path = { "CurrentRun", "Hero", "TraitDictionary" },
				HasNone = { "CindraArcCastBoon", "CindraLobCastBoon" },
			},
		},
	},

	-- Asymmetric negation: CindraReclaimBoon avoids VerdanBarkBoon, but
	-- VerdanBarkBoon (see TraitData_Verdan.lua) does NOT avoid this one
	-- back. Coverage #9 -- must become `blockedBy = ["VerdanBarkBoon"]` on
	-- CindraReclaimBoon only, not a symmetric exclusiveGroup.
	CindraReclaimBoon =
	{
		Icon = "Boon_Cindra_20",
		InheritFrom = { "BaseTraitTemplate" },
		GameStateRequirements =
		{
			{
				Path = { "CurrentRun", "Hero", "TraitDictionary" },
				HasNone = { "VerdanBarkBoon" },
			},
		},
	},

	-- Deliberately malformed: a HasNone whose Path is neither the
	-- trait-vs-trait idiom (Path ends in "TraitDictionary") nor the
	-- offer-time idiom (Path is [...,"ChosenRewardType"]). Coverage #11 --
	-- the classifier cannot place this in either bucket and must fail the
	-- build for manual review rather than silently guessing.
	CindraMalformedBoon =
	{
		Icon = "Boon_Cindra_66",
		InheritFrom = { "BaseTraitTemplate" },
		GameStateRequirements =
		{
			{
				Path = { "CurrentRun", "Hero", "EquippedRelic" },
				HasNone = { "VerdanGroveBoon" },
			},
		},
	},

	-- DebugOnly trait: looks like a normal offerable boon (real Slot, real
	-- Icon) but must be excluded from the catalog. Coverage #13.
	CindraDebugOnlyBoon =
	{
		Icon = "Boon_Cindra_99",
		InheritFrom = { "CindraCoreTemplate" },
		Slot = "Rush",
		DebugOnly = true,
	},

} )
