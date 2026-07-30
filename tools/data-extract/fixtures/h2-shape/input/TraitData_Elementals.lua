-- SYNTHETIC FIXTURE -- no real game content. Mimics Hades II's
-- TraitData_Elementals.lua: an Infusion boon gated on an element-count
-- threshold to be OFFERED (GameStateRequirements), with a second, higher
-- threshold before its effect ACTIVATES (ActivationRequirements).
-- Coverage #7.

OverwriteTableKeys( TraitData, {

	-- Cindra, ember infusion
	InfusionRadianceBoon =
	{
		Icon = "Boon_Infusion_01",
		InheritFrom = { "InfusionTraitTemplate" },
		-- obtainable once the player holds >= 2 Ember-affinity traits
		GameStateRequirements =
		{
			{
				Path = { "CurrentRun", "Hero", "Elements", "Ember" },
				Comparison = ">=",
				Value = 2,
			},
		},
		-- but its effect only turns on at >= 3
		ActivationRequirements =
		{
			{
				Path = { "CurrentRun", "Hero", "Elements", "Ember" },
				Comparison = ">=",
				Value = 3,
			},
		},
	},

} )
