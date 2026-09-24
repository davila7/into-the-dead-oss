export type PerkId = 'quickHands' | 'piercing' | 'extendedMag' | 'hairTrigger' | 'fleetFoot' | 'secondWind';

export interface PerkDef {
  id: PerkId;
  name: string;
  /** One line shown on the perk card. */
  blurb: string;
  /** How many times it can be taken in one run. */
  maxStacks: number;
}

/** Effects live in `CONFIG.perks` and `perkedWeapon`; this is just what the cards say. */
export const PERKS: Record<PerkId, PerkDef> = {
  quickHands: { id: 'quickHands', name: 'Quick Hands', blurb: 'Reload 25% faster.', maxStacks: 3 },
  piercing: { id: 'piercing', name: 'Piercing Rounds', blurb: 'Every bullet goes through one more body.', maxStacks: 2 },
  extendedMag: { id: 'extendedMag', name: 'Extended Mag', blurb: '50% more rounds per magazine.', maxStacks: 2 },
  hairTrigger: { id: 'hairTrigger', name: 'Hair Trigger', blurb: 'Fire 20% faster.', maxStacks: 3 },
  fleetFoot: { id: 'fleetFoot', name: 'Fleet Foot', blurb: 'Sidestep 25% faster.', maxStacks: 2 },
  secondWind: { id: 'secondWind', name: 'Second Wind', blurb: 'Shove off the next thing that grabs you.', maxStacks: 3 },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

/** How many times each perk has been taken this run. */
export type PerkStacks = Partial<Record<PerkId, number>>;
