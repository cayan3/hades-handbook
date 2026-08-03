-- SYNTHETIC FIXTURE -- no real game content. Mimics Hades I's single
-- LootData.lua: no named prerequisite sets exist anywhere in this game's
-- data -- prerequisites live INLINE inside each god's own LinkedUpgrades
-- table, and the same id-list content is simply RETYPED wherever it's
-- needed (coverage #1's "inline-and-repeated" half; compare against
-- fixtures/h2-shape, where the identical grouping is a single named
-- LinkedTraitData entry referenced by id).

LootData =
{
	BaseLoot =
	{
		GodLoot = true,
	},

	SableUpgrade =
	{
		InheritFrom = { "BaseLoot" },
		Icon = "BoonSymbolSable",
		PriorityUpgrades = { "SableEmberTrait", "SableFlareTrait", "SableWardenTrait" },
		WeaponUpgrades = { "SableEmberTrait", "SableFlareTrait", "SableWardenTrait" },
		Traits = { "SablePyreTrait", "SableEmberComboTrait" },

		LinkedUpgrades =
		{
			-- Legendary gated behind Sable's own core boons AND Auric's --
			-- i.e. structurally a duo-shaped requirement even though
			-- Hades I has no separate "Duo" rarity tier (see
			-- fixtures/README.md and the earlier real-data investigation
			-- note: Hades I duo boons use the Legendary RarityLevels key).
			-- Coverage #3 (two-set OneFromEachSet, inline form).
			SablePyreTrait =
			{
				OneFromEachSet =
				{
					{ "SableEmberTrait", "SableFlareTrait", "SableWardenTrait" },
					{ "AuricRootTrait", "AuricBarkTrait", "AuricGroveTrait" },
				},
			},

			-- Coverage #2 (OneOf, inline form).
			SableEmberComboTrait =
			{
				OneOf = { "SableEmberTrait", "SableFlareTrait" },
			},
		},
	},

	AuricUpgrade =
	{
		InheritFrom = { "BaseLoot" },
		Icon = "BoonSymbolAuric",
		PriorityUpgrades = { "AuricRootTrait", "AuricBarkTrait", "AuricGroveTrait" },
		WeaponUpgrades = { "AuricRootTrait", "AuricBarkTrait", "AuricGroveTrait" },
		Traits = {},

		LinkedUpgrades =
		{
			-- SAME id, SAME inline set-of-sets, retyped verbatim in a
			-- SECOND god's block -- exactly how the real Hades I data
			-- offers a boon from either parent god's pedestal. The
			-- extractor must recognize this as the SAME synthesized
			-- prerequisite (same content -> same set identity), not a
			-- second, different one. Coverage #1's core point.
			SablePyreTrait =
			{
				OneFromEachSet =
				{
					{ "SableEmberTrait", "SableFlareTrait", "SableWardenTrait" },
					{ "AuricRootTrait", "AuricBarkTrait", "AuricGroveTrait" },
				},
			},
		},
	},

	FennickUpgrade =
	{
		InheritFrom = { "BaseLoot" },
		GodLoot = false,
		Speaker = "NPC_Fennick_01",
		Icon = "BoonSymbolFennick",
		Traits = { "FennickSwiftTrait" },
	},
}
