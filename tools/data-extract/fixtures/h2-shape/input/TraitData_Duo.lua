-- SYNTHETIC FIXTURE -- no real game content. Mimics Hades II's
-- TraitData_Duo.lua: the boon definition itself carries only a `-- GodA x
-- GodB` comment identifying its two parent gods; the actual prerequisite
-- lives separately in TraitData.lua's TraitRequirements table.

OverwriteTableKeys( TraitData, {

	CindraVerdanBloomBoon = -- Cindra x Verdan
	{
		Icon = "Boon_CindraVerdan_01",
		InheritFrom = { "DuoTraitTemplate" },
	},

} )
