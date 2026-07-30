-- SYNTHETIC FIXTURE -- no real game content. "Orithia" is an invented
-- narrative-cameo character: her boon inherits CameoBoonBase (the
-- fixture's stand-in for Hades II's real InPersonOlympianTrait idiom), so
-- she must classify as godKind = NonPoolSlot even though her boon looks
-- otherwise ordinary. Coverage #14.
-- NOTE: not in the originally requested file list -- added because
-- coverage #14 needs a concrete god/boon to carry the cameo marker. See
-- fixtures/README.md.

OverwriteTableKeys( TraitData, {

	OrithiaBlessBoon =
	{
		Icon = "Boon_Orithia_01",
		InheritFrom = { "CameoBoonBase" },
	},

} )
