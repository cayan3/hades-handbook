-- SYNTHETIC FIXTURE -- no real game content. Mimics Hades II's
-- TraitData_Aspect.lua: the weapon forms live in a table of their own rather
-- than in TraitData, and each names its weapon outright. The screen table
-- names them too, so this is the pairing that is checked from both ends.

TraitSetData.Aspects =
{
	GlaiveBaseAspect =
	{
		InheritFrom = { "WeaponEnchantmentTrait" },
		Icon = "WeaponEnchantment_Glaive_00",
		RequiredWeapon = "WeaponGlaive",
	},

	GlaiveTwinAspect =
	{
		InheritFrom = { "WeaponEnchantmentTrait" },
		Icon = "WeaponEnchantment_Glaive_01",
		RequiredWeapon = "WeaponGlaive",
	},
}

-- The forms are then merged into TraitData, which is what puts them in the
-- catalog beside the boons. TraitSetData keeps its own copy, and membership of
-- that copy is what marks a record a form.
OverwriteTableKeys( TraitData, TraitSetData.Aspects )
