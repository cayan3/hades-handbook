-- SYNTHETIC FIXTURE -- no real game content. Verdan's offering table.
--
-- Verdan is in the pool and says so on his own table. Cindra is in it and says
-- nothing, inheriting the flag instead. The two together are the only reason
-- either says anything: a test over one of them cannot tell a resolver that
-- walks InheritFrom from one that reads the field and happens to be asked
-- about the god who declares it.

LootSetData.Verdan =
{
	VerdanUpgrade =
	{
		InheritFrom = { "BaseLoot", "BaseSoundPackage" },
		GodLoot = true,
		Icon = "BoonSymbolVerdan",
	},
}
