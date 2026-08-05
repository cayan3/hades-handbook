-- SYNTHETIC FIXTURE -- no real game content. Thren's offering table, which is
-- the awkward one in both of the ways the real game is awkward.
--
-- He hands boons out without taking a pool slot: he overrides the base's flag
-- and keeps a speaker. That pair is the whole difference between him and the
-- weapon upgrade in LootData.lua, which overrides the same flag and has
-- nobody, so a test that only asked about the flag would file a god as a
-- mechanical slot.
--
-- And his table is not named after him -- the section says Thren, the entry
-- says WanderUpgrade. Reading the god's name off the entry id would drop him
-- out of the emitted records entirely, and a god who was never read looks
-- exactly like a god the game does not have. He owns no per-god trait file,
-- which is the same position the real one is in.

LootSetData.Thren =
{
	WanderUpgrade =
	{
		InheritFrom = { "BaseLoot", "BaseSoundPackage" },
		GodLoot = false,
		Speaker = "NPC_Thren_01",
		Icon = "BoonSymbolThren",
	},
}
