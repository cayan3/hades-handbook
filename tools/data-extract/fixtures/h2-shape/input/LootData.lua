-- SYNTHETIC FIXTURE -- no real game content. Mimics Hades II's base
-- LootData.lua: the `Loot` section holds the template every offering table
-- inherits, plus the mechanical slots that are not gods. Per-god tables live
-- in their own LootData_<God>.lua files, each assigning one more section.
--
-- What this file exists to exercise: `GodLoot` is declared HERE and nowhere
-- else for a god who is in the pool, so recognising one means resolving the
-- flag through InheritFrom rather than reading it off the table. The
-- mechanical slots inherit exactly the same base and are not gods, which is
-- what stops inheritance alone from being the test.

LootSetData.Loot =
{
	BaseSoundPackage =
	{
		SelectionSound = "/SFX/FixtureSelect",
	},

	BaseLoot =
	{
		GodLoot = true,
		UseText = "UseLoot",
	},

	-- Turns the flag off and has nobody to do the offering: a weapon upgrade
	-- is picked up, not handed over. The only mechanical slot with an icon,
	-- so the emitted __mechanic_ record has something to carry.
	WeaponUpgrade =
	{
		InheritFrom = { "BaseLoot", "BaseSoundPackage" },
		GodLoot = false,
		Icon = "BoonSymbolAnvil",
	},

	StackUpgrade =
	{
		InheritFrom = { "BaseLoot", "BaseSoundPackage" },
		GodLoot = false,
	},
}
