-- SYNTHETIC FIXTURE -- no real game content. "Glaive" is an invented weapon.
-- Mimics Hades II's per-weapon trait file: every hammer upgrade inherits
-- WeaponTrait beside a base of its weapon's own, and separately asks that the
-- run hold the weapon. The base is named for the weapon's noun rather than for
-- its id, which is why the pairing is learned from the records carrying both.

OverwriteTableKeys( TraitData, {

	GlaiveHammerTrait =
	{
		DebugOnly = true,
	},

	GlaiveReachTrait =
	{
		Icon = "Weapon_Glaive_01",
		InheritFrom = { "WeaponTrait", "GlaiveHammerTrait" },
		GameStateRequirements =
		{
			{
				Path = { "CurrentRun", "Hero", "Weapons" },
				HasAll = { "WeaponGlaive" },
			},
		},
	},

	GlaiveVolleyTrait =
	{
		Icon = "Weapon_Glaive_02",
		InheritFrom = { "WeaponTrait", "GlaiveHammerTrait" },
		GameStateRequirements =
		{
			{
				Path = { "CurrentRun", "Hero", "Weapons" },
				HasAll = { "WeaponGlaive" },
			},
		},
	},
} )
