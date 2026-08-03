-- SYNTHETIC FIXTURE -- no real game content. Mimics Hades I's
-- TraitData.lua: a flat table of every trait (no per-god file split), a
-- handful of shared rarity-tier base templates, and "scattered special
-- cases" -- inline RequiredOneOfTraits/RequiredTrait/RequiredFalseTrait(s)
-- fields directly on individual traits, used only where a trait needs a
-- requirement that ISN'T already expressed via its god's LootData
-- LinkedUpgrades block.

TraitData =
{
	ShopTier1Trait =
	{
		Cost = 30,
		RarityLevels =
		{
			Common = { MinMultiplier = 1.0, MaxMultiplier = 1.0 },
			Rare = { MinMultiplier = 1.3, MaxMultiplier = 1.5 },
			Epic = { MinMultiplier = 1.8, MaxMultiplier = 2.0 },
			Heroic = { MinMultiplier = 2.3, MaxMultiplier = 2.5 },
		},
	},

	ShopTier3Trait =
	{
		Cost = 120,
		RarityLevels =
		{
			Legendary = { MinMultiplier = 1, MaxMultiplier = 1 },
		},
	},

	-- Mirrors Hades I's real SynergyTrait: Duo/Legendary status arrives via
	-- the SAME RarityLevels.Legendary key as ShopTier3Trait (Hades I has no
	-- separate "Duo" rarity tier, unlike Hades II) -- plus an offer-time
	-- reward-type gate.
	SynergyTraitTemplate =
	{
		RequiredFalseRewardType = "TradeOffReward",
		IsDuoBoon = true,
		Frame = "Duo",
		RarityLevels =
		{
			Legendary = { MinMultiplier = 1, MaxMultiplier = 1 },
		},
	},

	-- Sable's three core boons. Hades I sets `God` directly on the trait
	-- (unlike Hades II, which has no such field and relies on file
	-- provenance) -- read it verbatim, don't infer it.
	SableEmberTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		God = "Sable",
		Slot = "Melee",
		Icon = "Boon_Sable_01",
	},
	SableFlareTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		God = "Sable",
		Slot = "Secondary",
		Icon = "Boon_Sable_02",
	},
	SableWardenTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		God = "Sable",
		Slot = "Ranged",
		Icon = "Boon_Sable_03",
	},

	-- Legendary; its actual OneFromEachSet prerequisite lives inline in
	-- LootData.lua's LinkedUpgrades (both SableUpgrade's AND AuricUpgrade's
	-- blocks -- coverage #1). Nothing here in TraitData.lua expresses that
	-- requirement at all -- this is the structural point of fixture B.
	SablePyreTrait =
	{
		InheritFrom = { "ShopTier3Trait" },
		God = "Sable",
		Icon = "Boon_Sable_09",
	},

	-- Its prerequisite is ALSO inline in LootData.lua (SableUpgrade's
	-- LinkedUpgrades, coverage #2's inline form). This field carries a
	-- SEPARATE, unrelated requirement: an asymmetric negation.
	-- Coverage #9, Hades-I idiom (RequiredFalseTrait, not HasNone).
	SableEmberComboTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		God = "Sable",
		Icon = "Boon_Sable_12",
		RequiredFalseTrait = "AuricBarkTrait",
	},

	-- SableCutContentTrait =
	-- {
	-- 	InheritFrom = { "ShopTier1Trait" },
	-- 	God = "Sable",
	-- 	Icon = "Boon_Sable_13",
	-- }
	-- ^ commented out entirely (coverage #12) -- proves the same
	-- loading-drops-comments behavior as fixture A, in Hades I's flat
	-- single-table shape.

	-- Duo/Synergy-flavored boon: exists purely to carry the offer-time
	-- reward-type gate. Coverage #10, Hades-I idiom
	-- (RequiredFalseRewardType, a plain field -- not a GameStateRequirements
	-- wrapper the way Hades II expresses the same idea).
	SableAuricBloomTrait = -- Sable x Auric
	{
		InheritFrom = { "SynergyTraitTemplate" },
		Icon = "Boon_SableAuric_01",
	},

	AuricRootTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		God = "Auric",
		Slot = "Melee",
		Icon = "Boon_Auric_01",
	},
	AuricBarkTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		God = "Auric",
		Slot = "Secondary",
		Icon = "Boon_Auric_02",
		-- NOTE: deliberately does NOT declare RequiredFalseTrait back at
		-- SableEmberComboTrait -- this is the other half of the #9
		-- asymmetric pair; must end up with blockedBy = null.
	},
	AuricGroveTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		God = "Auric",
		Slot = "Ranged",
		Icon = "Boon_Auric_03",
	},

	-- Non-pool "god": a Hermes-analog messenger. GodLoot = false is set
	-- directly on FennickUpgrade in LootData.lua -- this is the one
	-- fixture where godKind is derived from a REAL GodLoot field rather
	-- than an InheritFrom marker (compare fixtures/h2-shape's Orithia,
	-- which has no LootData at all).
	FennickSwiftTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		God = "Fennick",
		Icon = "Boon_Fennick_01",
	},

	-- DebugOnly trait, coverage #13 (Hades-I idiom: flagged directly on
	-- the trait itself, same field name as Hades II's).
	SableDebugTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		God = "Sable",
		DebugOnly = true,
		Icon = "Boon_Sable_66",
	},

	-- References a trait id that is never defined anywhere in this
	-- fixture. Coverage #15, Hades-I idiom (RequiredOneOfTraits, a plain
	-- inline field, rather than Hades II's centralized-table shape).
	SableMirageTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		God = "Sable",
		Icon = "Boon_Sable_77",
		RequiredOneOfTraits = { "SableEmberTrait", "SablePhantomTrait" },
	},

	-- Names its own source table instead of being listed in one. No God
	-- field, and no god's Traits/PriorityUpgrades/WeaponUpgrades or
	-- LinkedUpgrades mentions it, so LootSource is the only thing that says
	-- whose it is. Six real Hades I traits are in exactly this position.
	SableTideTrait =
	{
		InheritFrom = { "ShopTier1Trait" },
		LootSource = "SableUpgrade",
		Icon = "Boon_Sable_88",
	},
}
