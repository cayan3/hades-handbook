-- SYNTHETIC FIXTURE -- no real game content. Mimics Hades II's base
-- TraitData.lua: shared base templates (all DebugOnly, never offerable on
-- their own), a LinkedTraitData table of named prerequisite sets, and a
-- centralized TraitRequirements table keyed by trait id.

TraitData =
{
	BaseTraitTemplate =
	{
		DebugOnly = true,
		Cost = 30,
		RarityLevels =
		{
			Common = { MinMultiplier = 1.0, MaxMultiplier = 1.0 },
			Rare = { MinMultiplier = 1.3, MaxMultiplier = 1.5 },
			Epic = { MinMultiplier = 1.8, MaxMultiplier = 2.0 },
			Heroic = { MinMultiplier = 2.3, MaxMultiplier = 2.5 },
		},
	},

	EmberAffinityBase =
	{
		DebugOnly = true,
		Elements = { "Ember" },
	},

	RootAffinityBase =
	{
		DebugOnly = true,
		Elements = { "Root" },
	},

	AetherAffinityBase =
	{
		DebugOnly = true,
		Elements = { "Aether" },
	},

	-- two-level InheritFrom chain: a boon inherits CindraCoreTemplate, which
	-- itself inherits BaseTraitTemplate + EmberAffinityBase. RarityLevels and
	-- Elements both arrive two hops away from the leaf boon (coverage #6).
	CindraCoreTemplate =
	{
		DebugOnly = true,
		InheritFrom = { "BaseTraitTemplate", "EmberAffinityBase" },
	},

	VerdanCoreTemplate =
	{
		DebugOnly = true,
		InheritFrom = { "BaseTraitTemplate", "RootAffinityBase" },
	},

	LegendaryTraitTemplate =
	{
		DebugOnly = true,
		Cost = 120,
		BlockStacking = true,
		RarityLevels =
		{
			Legendary = { MinMultiplier = 1, MaxMultiplier = 1 },
		},
	},

	DuoTraitTemplate =
	{
		DebugOnly = true,
		InheritFrom = { "AetherAffinityBase" },
		IsDuoBoon = true,
		Frame = "Duo",
		BlockStacking = true,
		-- room/reward-state negation: an offer-time gate, NOT a trait-vs-trait
		-- exclusion. Coverage #10 -- must be discarded from exclusiveGroup/
		-- blockedBy entirely, not misread as a trait reference.
		GameStateRequirements =
		{
			{
				Path = { "CurrentRun", "CurrentRoom", "ChosenRewardType" },
				IsNone = { "TradeOffReward" },
			},
		},
		RarityLevels =
		{
			Duo = { MinMultiplier = 1, MaxMultiplier = 1 },
		},
	},

	InfusionTraitTemplate =
	{
		DebugOnly = true,
		BlockStacking = true,
		CustomRarityName = "Boon_Infusion",
		Frame = "Infusion",
		RarityLevels =
		{
			Common = { Multiplier = 1 },
			Rare = { Multiplier = 1 },
			Epic = { Multiplier = 1 },
		},
	},

	-- narrative-cameo base (mirrors Hades II's InPersonOlympianTrait):
	-- anything inheriting this is a one-off story boon, not a rotating pool
	-- god. Coverage #14.
	CameoBoonBase =
	{
		DebugOnly = true,
		RarityLevels =
		{
			Common = { Multiplier = 1 },
		},
	},
}

-- Named prerequisite sets (coverage #1, the "named in A" half -- compare
-- against h1-shape, where the identical content appears only as repeated
-- inline lists with no name at all).
LinkedTraitData =
{
	CindraCoreTraits = { "CindraStrikeBoon", "CindraFlareBoon", "CindraWardenBoon" },
	VerdanCoreTraits = { "VerdanRootBoon", "VerdanBarkBoon", "VerdanGroveBoon" },
}

-- Centralized prerequisite table, keyed by trait id.
TraitRequirements =
{
	-- Cindra
	CindraEmberBoon = { OneOf = LinkedTraitData.CindraCoreTraits, },   -- coverage #2

	-- CindraObsoleteBoon = { OneOf = LinkedTraitData.CindraCoreTraits, },
	-- ^ commented out on purpose (coverage #12): loading the Lua and
	-- walking the resulting table drops this entirely, unlike a
	-- text/regex-based scanner which might still "see" the line.

	-- Legendary gated behind the SAME god's own boons, three-set
	-- OneFromEachSet (coverage #3 three-set form, #5 same-god legendary gate)
	CindraPyreBoon =
	{
		OneFromEachSet =
		{
			LinkedTraitData.CindraCoreTraits,
			{ "CindraEmberBoon", "CindraArcCastBoon" },
			{ "CindraLobCastBoon", "CindraEchoCastBoon" },
		},
	},

	-- Cross-god duo, two-set OneFromEachSet referencing a SECOND god's named
	-- set (coverage #3 two-set form, #4 cross-god duo)
	CindraVerdanBloomBoon =
	{
		OneFromEachSet =
		{
			LinkedTraitData.CindraCoreTraits,
			LinkedTraitData.VerdanCoreTraits,
		},
	},

	-- Dangling reference: VerdanPhantomBoon is never defined anywhere in
	-- this fixture (coverage #15).
	VerdanBriarBoon =
	{
		OneOf = { "VerdanRootBoon", "VerdanPhantomBoon" },
	},
}
