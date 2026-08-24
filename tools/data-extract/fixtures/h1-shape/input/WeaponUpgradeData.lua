-- SYNTHETIC FIXTURE -- no real game content. Mimics Hades I's
-- WeaponUpgradeData.lua: keyed by weapon, each entry naming one of that
-- weapon's forms. The base form is named as the investment the weapon needs
-- rather than as an upgrade of it, which is why both keys are read.

WeaponUpgradeData =
{
	DefaultGameStateRequirement =
	{
		RequiredTrueFlags = { "FormsUnlocked" },
	},

	GlaiveWeapon =
	{
		{
			Costs = { 1, 1, 1 },
			RequiredInvestmentTraitName = "GlaiveBaseUpgradeTrait",
			Image = "Codex_Portrait_Glaive",
		},
		{
			Costs = { 1, 2, 3 },
			TraitName = "GlaiveTwinTrait",
			Image = "Codex_Portrait_GlaiveAlt01",
		},
	},
}
