export type WeaponId = 'pistol' | 'shotgun' | 'rifle' | 'smg';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** One-line trade-off shown when the player is offered the weapon. */
  blurb: string;
  magazine: number;
  reloadTime: number;
  fireCooldown: number;
  /** Keeps firing while the trigger is held. */
  automatic: boolean;
  /** Rays per shot and their random cone half-angle (radians). */
  pellets: number;
  spread: number;
  /** Body damage per ray (zombies have CONFIG.gun.bodyHealth); headshots always kill. */
  damage: number;
  /** How many zombies one ray can pass through. */
  pierce: number;
  range: number;
  /** Viewmodel kick strength, 1 = pistol. */
  recoil: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    blurb: 'Reliable. 6 rounds, quick reload.',
    magazine: 6,
    reloadTime: 1.6,
    fireCooldown: 0.28,
    automatic: false,
    pellets: 1,
    spread: 0,
    damage: 1,
    pierce: 1,
    range: 60,
    recoil: 1,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Pump Shotgun',
    blurb: 'Drops anything up close. 5 shells, slow pump.',
    magazine: 5,
    reloadTime: 2.4,
    fireCooldown: 0.75,
    automatic: false,
    pellets: 7,
    spread: 0.06,
    damage: 1,
    pierce: 1,
    range: 28,
    recoil: 1.8,
  },
  rifle: {
    id: 'rifle',
    name: 'Lever Rifle',
    blurb: 'One body shot kills and it goes through. 8 rounds.',
    magazine: 8,
    reloadTime: 2.6,
    fireCooldown: 0.6,
    automatic: false,
    pellets: 1,
    spread: 0,
    damage: 2,
    pierce: 3,
    range: 90,
    recoil: 1.4,
  },
  smg: {
    id: 'smg',
    name: 'SMG',
    blurb: 'Hold to spray. 30 rounds, weak and wild.',
    magazine: 30,
    reloadTime: 2,
    fireCooldown: 0.085,
    automatic: true,
    pellets: 1,
    spread: 0.025,
    damage: 1,
    pierce: 1,
    range: 50,
    recoil: 0.45,
  },
};

/** Weapons that can turn up as pickups. */
export const PICKUP_WEAPONS: WeaponId[] = ['shotgun', 'rifle', 'smg'];
