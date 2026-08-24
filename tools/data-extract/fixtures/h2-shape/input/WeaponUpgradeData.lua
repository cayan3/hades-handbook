-- SYNTHETIC FIXTURE -- no real game content. Mimics Hades II's
-- WeaponUpgradeData.lua, which hangs the aspect screen off ScreenData. Its
-- DisplayOrder is the one place a Hades II form's weapon is written down.

ScreenData.WeaponUpgradeScreen =
{
	ItemStartX = 970,
	ItemNameText =
	{
		TextArgs = ScreenData.UpgradeChoice.TitleText,
	},

	FreeUnlocks =
	{
		WeaponGlaive = "GlaiveBaseAspect",
	},

	DisplayOrder =
	{
		WeaponGlaive =
		{
			"GlaiveBaseAspect",
			"GlaiveTwinAspect",
		},
	},
}
