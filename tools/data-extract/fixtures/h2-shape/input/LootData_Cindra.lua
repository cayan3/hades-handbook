-- SYNTHETIC FIXTURE -- no real game content. Cindra's offering table, in the
-- one-section-per-file shape Hades II uses.
--
-- Cindra is in the god pool and says so nowhere: she carries no GodLoot of her
-- own and is a pool god purely through BaseLoot. Two of the real game's
-- Olympians are in exactly this position, so reading the field off the table
-- rather than resolving it answers nothing for them. Verdan is the same fact
-- written the other way, declared on his own table.

LootSetData.Cindra =
{
	CindraUpgrade =
	{
		InheritFrom = { "BaseLoot", "BaseSoundPackage" },
		Icon = "BoonSymbolCindra",
		Weight = 10,
	},
}
