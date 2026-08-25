import type { TraitId } from "@repo/core";
import type { GameKey } from "./data.js";

/**
 * What kind of thing each Daedalus hammer changes, and what it says it does.
 *
 * Written by hand, because neither game groups its hammers: no hammer carries a
 * slot, and the only grouping in the data is mutual exclusion, which overlaps.
 * Generated from a worksheet, so edit that and re-run the script rather than
 * editing here. It lives beside the overlay instead of in it because the
 * overlay is a few corrections and this is a whole table.
 *
 * The descriptions replace the extracted ones, which write `?` where the game
 * fills a number in at runtime. A hammer's numbers never change, so we can just
 * say them. Two values means the second is the Rank II one, which you only get
 * from Icarus' Latest Model.
 */
export type HammerCategory = "Attack" | "Special" | "Aspect-exclusive" | "Misc";

export interface HammerEntry {
  readonly category: HammerCategory;
  /** Used instead of the extracted description; see above. */
  readonly description: string;
}

/** Hammers the games still have records for but no longer offer. */
export type CutHammers = ReadonlySet<TraitId>;


const HADES1: Readonly<Record<TraitId, HammerEntry>> = Object.freeze({
  BowBondBoostTrait: { category: "Aspect-exclusive", description: "Your Celestial Sharanga Attack creates a Blast Wave around you." },
  BowChainShotTrait: { category: "Attack", description: "Your Attack hits up to 3 foes, dealing +15% base damage for each." },
  BowCloseAttackTrait: { category: "Attack", description: "Your Attack deals +150% damage to nearby foes." },
  BowConsecutiveBarrageTrait: { category: "Special", description: "Your Special deals +3 base damage for each consecutive hit to a foe." },
  BowDoubleShotTrait: { category: "Attack", description: "Your Attack fires 2 shots side-by-side, but has reduced range." },
  BowLongRangeDamageTrait: { category: "Attack", description: "Your Attack deals +200% damage to distant foes." },
  BowPenetrationTrait: { category: "Special", description: "Your Special pierces foes and deals +400% damage to Armor." },
  BowPowerShotTrait: { category: "Attack", description: "Your Power Shot is easier to execute and deals +150% damage." },
  BowSecondaryBarrageTrait: { category: "Special", description: "Your Special fires +4 shots." },
  BowSecondaryFocusedFireTrait: { category: "Special", description: "Hold Special for up to 250% base damage; minimum range reduced." },
  BowSlowChargeDamageTrait: { category: "Attack", description: "Your Attack deals +300% damage in an area, but charges up slower." },
  BowTapFireTrait: { category: "Attack", description: "Hold Attack to shoot rapidly, but you cannot Power Shot." },
  BowTripleShotTrait: { category: "Attack", description: "Your Attack fires 3 shots in a spread pattern." },
  FistAttackDefenseTrait: { category: "Misc", description: "While using your Attack or Special, you are Sturdy." },
  FistAttackFinisherTrait: { category: "Attack", description: "Your Dash-Strike deals +60% damage; added to Attack sequence." },
  FistChargeSpecialTrait: { category: "Special", description: "Hold Special for longer range and up to +100% base damage." },
  FistConsecutiveAttackTrait: { category: "Attack", description: "Your Attack deals +5 base damage for each consecutive hit to a foe." },
  FistDashAttackHealthBufferTrait: { category: "Attack", description: "Your Dash-Strike pierces foes and deals +900% damage to Armor." },
  FistDetonateBoostTrait: { category: "Aspect-exclusive", description: "Maim-afflicted foes take 25% damage and move 30% slower." },
  FistDoubleDashSpecialTrait: { category: "Special", description: "Your Dash-Upper deals +100% damage in an area." },
  FistHeavyAttackTrait: { category: "Attack", description: "Your Attack becomes a 3-hit sequence; each deals 40 base damage." },
  FistKillTrait: { category: "Special", description: "Whenever your Special slays foes, restore 2% Healing." },
  FistReachAttackTrait: { category: "Attack", description: "Your Attack has more range and deals +10% damage." },
  FistSpecialFireballTrait: { category: "Special", description: "Your Special becomes a charged shot that deals 50 base damage." },
  FistSpecialLandTrait: { category: "Special", description: "After using your Special, deal 90 damage in an area where you land." },
  FistTeleportSpecialTrait: { category: "Special", description: "Your Special becomes a flying kick that deals 40 base damage twice." },
  GunArmorPenerationTrait: { category: "Attack", description: "Your Attack pierces foes and deals 50% damage to Armor." },
  GunChainShotTrait: { category: "Attack", description: "Your Attack bounces to +1 additional foe." },
  GunExplodingSecondaryTrait: { category: "Special", description: "Your Special becomes a rocket that deals 80 base damage." },
  GunGrenadeClusterTrait: { category: "Special", description: "Your Special fires a spread of 5 bombs, but each deals -30% damage." },
  GunGrenadeDropTrait: { category: "Special", description: "Your Special deals +300% base damage in a large area; it can hurt you." },
  GunGrenadeFastTrait: { category: "Special", description: "You can use your Special 3 times in rapid succession." },
  GunHeavyBulletTrait: { category: "Attack", description: "Your Attack deals damage in an area and briefly slows foes." },
  GunHomingBulletTrait: { category: "Attack", description: "Your Attack seeks the nearest foe and deals +10% damage." },
  GunInfiniteAmmoTrait: { category: "Attack", description: "Your Attack is a 3-round burst; you never have to Reload." },
  GunLoadedGrenadeBoostTrait: { category: "Aspect-exclusive", description: "Your Igneus Eden Hellfire radiates +250% damage in a larger area." },
  GunLoadedGrenadeInfiniteAmmoTrait: { category: "Aspect-exclusive", description: "Your Igneus Eden Attack has ∞ Cells, but its damage no longer ramps." },
  GunLoadedGrenadeLaserTrait: { category: "Aspect-exclusive", description: "Your Igneus Eden Attack damage to a foe ramps up +100% faster." },
  GunLoadedGrenadeSpeedTrait: { category: "Aspect-exclusive", description: "Your Igneus Eden Attack starts firing +50% faster with +15% range." },
  GunLoadedGrenadeWideTrait: { category: "Aspect-exclusive", description: "Your Igneus Eden Attack fires 3 beams in a spread pattern." },
  GunMinigunTrait: { category: "Attack", description: "Your Attack is faster and more accurate; gain +6 Rounds." },
  GunShotgunTrait: { category: "Attack", description: "Your Attack deals 40 base damage in a short spread; you have -6 Rounds." },
  GunSlowGrenade: { category: "Special", description: "Foes targeted by your Special move slower and take +30% damage." },
  ShieldBashDamageTrait: { category: "Attack", description: "Your Attack hits twice, but does not knock foes away." },
  ShieldBlockEmpowerTrait: { category: "Attack", description: "After blocking a foe, gain +20% damage and move speed for 10 Sec." },
  ShieldChargeHealthBufferTrait: { category: "Attack", description: "Your Bull Rush deals +400% damage to Armor." },
  ShieldChargeSpeedTrait: { category: "Attack", description: "Your Bull Rush charges up faster." },
  ShieldDashAOETrait: { category: "Attack", description: "Your Dash-Strike deals +50% damage in a larger area." },
  ShieldLoadAmmoBoostTrait: { category: "Aspect-exclusive", description: "After using your Naegling's Board Cast, you are Sturdy for 3 Sec." },
  ShieldPerfectRushTrait: { category: "Attack", description: "Your Bull Rush gains a Power Rush that deals +500% damage." },
  ShieldRushProjectileTrait: { category: "Attack", description: "Your Bull Rush instead fires a piercing shot that deals 80 damage." },
  ShieldThrowCatchExplode: { category: "Special", description: "Your Special deals 50 damage to foes around you when you catch it." },
  ShieldThrowElectiveCharge: { category: "Special", description: "Hold Special to charge your throw for up to +200% base damage." },
  ShieldThrowEmpowerTrait: { category: "Attack", description: "After your Special hits, your next 2 Attacks deal +80% damage." },
  ShieldThrowFastTrait: { category: "Special", description: "Your Special can strike up to 4 additional foes before returning." },
  ShieldThrowRushTrait: { category: "Special", description: "During your Dash, your Special is faster and deals +200% damage." },
  SpearAttackPhalanxTrait: { category: "Attack", description: "Your Attack strikes 3 times in a spread pattern." },
  SpearAutoAttack: { category: "Attack", description: "Hold Attack to strike rapidly, but you cannot Spin Attack." },
  SpearDashMultiStrike: { category: "Attack", description: "Your Dash-Strike hits 3 times, but your Dash has -25% range." },
  SpearReachAttack: { category: "Attack", description: "Your Attack has more range and deals +40% damage to distant foes." },
  SpearSpinChargeAreaDamageTrait: { category: "Attack", description: "Charging your Spin Attack makes you Sturdy and pulse 40 damage." },
  SpearSpinChargeLevelTime: { category: "Attack", description: "Your Spin Attack charges up and recovers much faster." },
  SpearSpinDamageRadius: { category: "Attack", description: "Your Spin Attack deals +125% damage and hits a larger area." },
  SpearSpinTravelDurationTrait: { category: "Aspect-exclusive", description: "Your Frost Fair Blade Spin Attack travels for +80% longer." },
  SpearThrowBounce: { category: "Special", description: "Your Special hits up to 7 foes, dealing +30% base damage for each." },
  SpearThrowCritical: { category: "Special", description: "Your Special deals +50% damage; +50% Critical chance on recovery." },
  SpearThrowElectiveCharge: { category: "Special", description: "Hold Special for up to +200% base damage; minimum range reduced." },
  SpearThrowExplode: { category: "Special", description: "Your Special becomes a shot that deals 50 base damage in an area." },
  SpearThrowPenetrate: { category: "Special", description: "Your Special deals +400% damage to Armor." },
  SwordBackstabTrait: { category: "Attack", description: "Your Attack deals +200% damage striking foes from behind." },
  SwordBlinkTrait: { category: "Special", description: "Your Special makes you lunge ahead, then become Sturdy for 0.8 Sec." },
  SwordConsecrationBoostTrait: { category: "Aspect-exclusive", description: "Your Holy Excalibur aura is +45% larger; makes foes +10% slower." },
  SwordCriticalTrait: { category: "Attack", description: "Your Thrust deals +200% damage and has a +40% Critical chance." },
  SwordCursedLifeStealTrait: { category: "Attack", description: "Your Attack restores 2 Healing per hit, but you have -60% Max Life." },
  SwordDoubleDashAttackTrait: { category: "Attack", description: "Your Dash-Strike hits twice and deals +20% damage." },
  SwordGoldDamageTrait: { category: "Attack", description: "Your Attack deals bonus damage equal to 5% of your current Charon's Obol." },
  SwordHealthBufferDamageTrait: { category: "Attack", description: "Your Attack deals +300% damage to Armor." },
  SwordHeavySecondStrikeTrait: { category: "Attack", description: "Your Attack becomes a big chop that deals 90 base damage." },
  SwordSecondaryAreaDamageTrait: { category: "Special", description: "Your Special hits a wider area and deals +20% damage." },
  SwordSecondaryDoubleAttackTrait: { category: "Special", description: "Your Special hits twice, but no longer knocks foes away." },
  SwordThrustWaveTrait: { category: "Attack", description: "Your Attack fires a wave that pierces foes, dealing 30 damage." },
  SwordTwoComboTrait: { category: "Attack", description: "Hold Attack to strike rapidly, dealing 25 base damage per hit." },
});

const HADES1_CUT: CutHammers = Object.freeze(new Set([
  "BowDashFanTrait",
  "BowRandomExplosionTrait",
  "BowTransitionTapFireTrait",
  "BowWideShotTrait",
  "FistChargeAttackTrait",
  "GunConsecutiveFireTrait",
  "GunDashAmmoTrait",
  "GunEmptyClipBlastTrait",
  "GunFinalBulletTrait",
  "GunSniperTrait",
  "ShieldBashReflectTrait",
  "ShieldDamageBarrierTrait",
  "ShieldDamageReductionTrait",
  "ShieldRushPunchTrait",
  "ShieldSlowChargeDamage",
  "ShieldThrowJumpDamageTrait",
  "ShieldThrowSingleTargetTrait",
  "SpearSpinAura",
  "SpearThrowFarRangeDamage",
  "SpearThrowObjectAOETrait",
  "SwordConsecutiveFirstStrikeTrait",
  "SwordRandomExplosionTrait",
  "SwordSecondaryBlinkTrait",
  "SwordThirdStrikeChargeTrait",
]));

const HADES2: Readonly<Record<TraitId, HammerEntry>> = Object.freeze({
  AxeArmorTrait: { category: "Special", description: "Each hit from your Special deals +300 damage to Armor." },
  AxeAttackRecoveryTrait: { category: "Attack", description: "Your Attack is 30%/?% faster." },
  AxeBlockEmpowerTrait: { category: "Special", description: "Your Special strikes farther ahead and deals +150%/200% damage." },
  AxeChargedSpecialTrait: { category: "Special", description: "You Channel your Ω Special 25%/?% faster." },
  AxeDashAttackTrait: { category: "Attack", description: "Your Dash-Strike hits 2 times in an area around you." },
  AxeFreeSpinTrait: { category: "Attack", description: "Your Ω Attack fires around you, leaving you free to move and strike at the same time." },
  AxeMassiveThirdStrikeTrait: { category: "Attack", description: "The final move in your Attack sequence hits 2 times, but uses 20 Magick." },
  AxeRallyFirstStrikeTrait: { category: "Aspect-exclusive", description: "Your Attack hits 2 times, but the 5-strike sequence becomes only the first slam." },
  AxeRallyFrenzyTrait: { category: "Aspect-exclusive", description: "Your Berserk lasts +2 Sec. and restores +1 Life per foe struck." },
  AxeRangedWhirlwindTrait: { category: "Attack", description: "Your Attacks also deal 60/80 damage to surrounding foes, for each and every strike." },
  AxeSecondStageTrait: { category: "Special", description: "Your Ω Special fires 2 times in succession, but uses +15 Magick." },
  AxeSpinSpeedTrait: { category: "Attack", description: "You Channel your Ω Attack faster, and move 50%/60% faster while it is active." },
  AxeSturdyTrait: { category: "Attack", description: "Your Attacks have +10/15 Power and you take -20% damage while using them." },
  AxeThirdStrikeTrait: { category: "Attack", description: "Your Attack has +300/400 Power, but the 3-strike sequence becomes only the final chop." },
  DaggerAttackFinisherTrait: { category: "Attack", description: "The last strike in your Attack sequence deals +300% damage in a larger area." },
  DaggerBackstabTrait: { category: "Attack", description: "Your Attacks deal 150% damage striking foes from behind." },
  DaggerBlinkAoETrait: { category: "Attack", description: "Your Ω Attack deals +400% damage in a wider area, but uses +20 Magick." },
  DaggerChargeStageSkipTrait: { category: "Special", description: "You Channel your Ω Special 40% faster." },
  DaggerDashAttackTripleTrait: { category: "Attack", description: "Your Dash-Strike also fires your Special 3 times at once in a fan pattern." },
  DaggerFinalHitTrait: { category: "Attack", description: "Your Attacks have +20 Power." },
  DaggerRapidAttackTrait: { category: "Attack", description: "Your Attacks are 35% faster." },
  DaggerSpecialConsecutiveTrait: { category: "Special", description: "Each hit from your Special deals +500 damage to Armor." },
  DaggerSpecialFanTrait: { category: "Special", description: "Your Specials deal +20% damage and your Ω Special fires +3 shots." },
  DaggerSpecialJumpTrait: { category: "Special", description: "Your Specials deal +15% damage and each hit bounces toward up to 2 more foes." },
  DaggerSpecialLineTrait: { category: "Special", description: "Your Ω Special fires each shot dead ahead and your Specials have +30% range." },
  DaggerSpecialReturnTrait: { category: "Special", description: "Your Specials have +15 Power and deal damage in a wider area." },
  DaggerTripleBuffTrait: { category: "Aspect-exclusive", description: "Your Blood Triad deals +222 damage." },
  DaggerTripleHomingSpecialTrait: { category: "Special", description: "Your Specials repeatedly deal damage 100% faster." },
  DaggerTripleRepeatWomboTrait: { category: "Aspect-exclusive", description: "Your Blood Triad has 33% chance to strike once more." },
  LobAmmoMagnetismTrait: { category: "Attack", description: "Your Shells fly back to you automatically and 100%/200% faster." },
  LobAmmoTrait: { category: "Special", description: "Gain +2/3 Shells." },
  LobGrowthTrait: { category: "Attack", description: "Your Attacks gain +50%/75% damage and blast size over 0.7 Sec. before they explode." },
  LobGunAttackDoublerTrait: { category: "Aspect-exclusive", description: "Your Ω Attack fires +2 times in succession." },
  LobGunAttackRangeTrait: { category: "Aspect-exclusive", description: "Your Attacks shoot +25%/35% farther and deal +25% damage." },
  LobGunBounceTrait: { category: "Aspect-exclusive", description: "Your Attacks bounce toward +1 foe and deal +15%/25% damage on the successive hit." },
  LobGunOverheatTrait: { category: "Aspect-exclusive", description: "Your Valkyrie form lasts +3/4 Sec." },
  LobGunSpecialBounceTrait: { category: "Aspect-exclusive", description: "Your Specials fly faster and deal +15%/25% damage for each foe struck." },
  LobInOutSpecialExTrait: { category: "Special", description: "After your Ω Special projectiles fire outward, they fire inward." },
  LobOneSideTrait: { category: "Special", description: "Your Specials launch you ahead faster and deal +50%/75% damage." },
  LobPulseAmmoCollectTrait: { category: "Attack", description: "Your Shells fire your Ω Attack whenever retrieved, but make you lose 25/20 Magick." },
  LobPulseAmmoTrait: { category: "Attack", description: "Whenever your Shells land, they deal 50%/75% of your Attack damage around them." },
  LobRushArmorTrait: { category: "Special", description: "Your Special deals +600 damage to Armor." },
  LobSpecialSpeedTrait: { category: "Special", description: "Your Specials are 35%/45% faster." },
  LobSpreadShotTrait: { category: "Attack", description: "Your Attacks fire your Shells all at once in a spread pattern." },
  LobStraightShotTrait: { category: "Attack", description: "After your Dash or Specials, your Attacks are faster and have +15/20 Power." },
  LobSturdySpecialTrait: { category: "Special", description: "Your Specials have +30/40 Power and you take -30%/40% damage while using them." },
  StaffAttackRecoveryTrait: { category: "Attack", description: "Your Attacks are 50%/80% faster." },
  StaffDashAttackTrait: { category: "Attack", description: "Your Dash-Strike hits a larger area and deals +900 damage to Armor." },
  StaffDoubleAttackTrait: { category: "Attack", description: "Your Attacks have +30/40 Power." },
  StaffExAoETrait: { category: "Attack", description: "Your Ω Attack deals +50%/75% damage and also strikes sideways." },
  StaffExHealTrait: { category: "Attack", description: "Whenever you slay a foe with your Ω Attack, restore 5/8 Life." },
  StaffFastSpecialTrait: { category: "Special", description: "Your Specials are 25%/35% faster." },
  StaffJumpSpecialTrait: { category: "Special", description: "Your Specials bounce toward up to +2 foes, dealing +10%/20% damage for each hit." },
  StaffLoneShadeRallyTrait: { category: "Aspect-exclusive", description: "Lone Shades deal +50%/90% damage and launch at foes struck by your Ω Special." },
  StaffLoneShadeRespawnTrait: { category: "Aspect-exclusive", description: "Lone Shades deal +50/75 damage and have 75% chance to reappear after striking a foe." },
  StaffLongAttackTrait: { category: "Attack", description: "Your Attack has more range and deals +100%/150% damage to distant foes." },
  StaffOneWayAttackTrait: { category: "Attack", description: "Your Attacks hit 2 times, but use +5 Magick." },
  StaffPowershotTrait: { category: "Special", description: "Your Ω Special gains a Power Shot that deals +50%/75% damage and restores 20 Magick." },
  StaffRaiseDeadBigTrait: { category: "Aspect-exclusive", description: "Your Attacks have +5/8 Power and hit a larger area." },
  StaffRaiseDeadDoubleTrait: { category: "Aspect-exclusive", description: "Your Ω Attack creates +1 damage field ahead of the first." },
  StaffSecondStageTrait: { category: "Special", description: "You can Channel +30/40 Magick into your Ω Special to deal +300%/399% damage in a larger area." },
  StaffTripleShotTrait: { category: "Special", description: "Your Specials fire 2 projectiles, but have -40% range." },
  SuitArmorTrait: { category: "Attack", description: "Your Attack deals +250 damage to Armor." },
  SuitAttackRangeTrait: { category: "Attack", description: "Your Attacks deal +30%/45% damage and reach farther ahead." },
  SuitAttackSizeTrait: { category: "Attack", description: "Your Attacks have +10 Power and deal damage in a larger area." },
  SuitAttackSpeedTrait: { category: "Attack", description: "Your Attacks are 35%/45% faster." },
  SuitComboBlockBuffTrait: { category: "Aspect-exclusive", description: "After blocking with your Ω Attack, become Destructive by up to +3/4 ranks." },
  SuitComboDashAttackTrait: { category: "Aspect-exclusive", description: "Your Dash-Strike hits a larger area and deals +40%/60% damage." },
  SuitComboDoubleSpecialTrait: { category: "Aspect-exclusive", description: "Absorbing Ω Special blasts also creates blasts from your Special, but you lose 5/3 Magick." },
  SuitComboForwardRocketTrait: { category: "Aspect-exclusive", description: "Your Specials have +30/45 Power and fly dead ahead." },
  SuitDashAttackTrait: { category: "Attack", description: "Your Dash-Strike hits +3 times." },
  SuitFullChargeTrait: { category: "Attack", description: "Your fully-charged Ω Attack has +100/140 Power." },
  SuitPowershotTrait: { category: "Aspect-exclusive", description: "Your Ω Attack gains a Power Shot that deals +150%/225% damage." },
  SuitSpecialAutoTrait: { category: "Special", description: "Whenever your Attacks strike foes, your Special has 25%/35% chance to fire automatically." },
  SuitSpecialBlockTrait: { category: "Special", description: "After blocking with your Ω Attack, your Special auto-fires 5 shots, reloading in 3 Sec." },
  SuitSpecialConsecutiveHitTrait: { category: "Special", description: "Your Specials briefly gain +5/8 Power for up to 5 consecutive hits to the same foe." },
  SuitSpecialDiscountTrait: { category: "Special", description: "Your Ω Special locks on faster and uses -20%/30% Magick." },
  SuitSpecialJumpTrait: { category: "Special", description: "Your Specials bounce toward up to 2/3 more foes." },
  SuitSpecialStartUpTrait: { category: "Special", description: "Your Specials launch and fly 80% faster." },
  TorchAttackSpeedTrait: { category: "Attack", description: "While you Channel your Attacks, you move and fire 20%/30% faster." },
  TorchAutofireSprintTrait: { category: "Aspect-exclusive", description: "As long as you Sprint, your Attacks and Specials have +5/8 Power." },
  TorchDiscountExAttackTrait: { category: "Attack", description: "You Channel your Ω Attack 50% faster, and it uses -1 Magick." },
  TorchEnhancedAttackTrait: { category: "Attack", description: "Your Attacks linger for +2 Sec. and launch back towards you after you Dash." },
  TorchExSpecialCountTrait: { category: "Special", description: "Your Specials create +1 projectile." },
  TorchLongevityTrait: { category: "Special", description: "Your Specials grow in size and deal up to +25%/35% damage the longer they are active." },
  TorchMoveSpeedTrait: { category: "Attack", description: "Your Attacks fire 20% farther and deal +30%/45% damage." },
  TorchOrbitPointTrait: { category: "Special", description: "Projectiles from your Specials orbit 20%/30% faster." },
  TorchSpecialImpactTrait: { category: "Special", description: "Your Ω Special lasts +2/3 Sec." },
  TorchSpecialLineTrait: { category: "Special", description: "Your Specials deal +100 damage to Armor." },
  TorchSpecialSpeedTrait: { category: "Special", description: "You Channel your Ω Special 20% faster, and it uses -10 Magick." },
  TorchSpinAttackTrait: { category: "Attack", description: "Your Attacks knock foes away and have +10/+15 Power." },
  TorchSplitAttackTrait: { category: "Attack", description: "Your Attacks split in 2 the first time they strike foes." },
});

const HADES2_CUT: CutHammers = Object.freeze(new Set([
]));

const HAMMERS: Readonly<Record<GameKey, Readonly<Record<TraitId, HammerEntry>>>> = Object.freeze({
  hades1: HADES1,
  hades2: HADES2,
});

const CUT: Readonly<Record<GameKey, CutHammers>> = Object.freeze({
  hades1: HADES1_CUT,
  hades2: HADES2_CUT,
});

/** Every hammer this game has a category for, by trait id. */
export function hammersFor(game: GameKey): Readonly<Record<TraitId, HammerEntry>> {
  return HAMMERS[game];
}

/**
 * Hammers the games no longer offer. A weapon page skips these, which is what
 * the list is for: the records still carry names and prose, so nothing on the
 * page can tell them from a hammer you can actually be offered.
 */
export function cutHammers(game: GameKey): CutHammers {
  return CUT[game];
}
