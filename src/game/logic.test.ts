import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  applyHit,
  cornCover,
  cricketLevel,
  levelAt,
  maxAlive,
  mulberry32,
  packFor,
  planCourse,
  planHorrors,
  playerSpeed,
  runnerChance,
  spawnInterval,
  stepTowards,
  vaultProfile,
  wrapAround,
  zombieSpeed,
} from './logic';

describe('applyHit', () => {
  it('kills on a headshot regardless of health', () => {
    expect(applyHit(CONFIG.gun.bodyHealth, 'head')).toEqual({ health: 0, killed: true });
  });

  it('needs bodyHealth body shots to kill', () => {
    let health: number = CONFIG.gun.bodyHealth;
    for (let i = 1; i < CONFIG.gun.bodyHealth; i++) {
      const r = applyHit(health, 'body');
      expect(r.killed).toBe(false);
      health = r.health;
    }
    expect(applyHit(health, 'body').killed).toBe(true);
  });

  it('applies weapon damage to body shots', () => {
    expect(applyHit(CONFIG.gun.bodyHealth, 'body', CONFIG.gun.bodyHealth).killed).toBe(true);
  });
});

describe('applyHit on tough zombies', () => {
  it('headshots multiply damage instead of killing outright', () => {
    const b = CONFIG.horrors.brute;
    expect(applyHit(b.health, 'head', 1, b.headMultiplier)).toEqual({ health: b.health - b.headMultiplier, killed: false });
    expect(applyHit(b.headMultiplier, 'head', 1, b.headMultiplier).killed).toBe(true);
  });
});

describe('difficulty curves', () => {
  it('spawn interval shrinks with distance but respects the floor', () => {
    expect(spawnInterval(0)).toBe(CONFIG.zombies.baseInterval);
    expect(spawnInterval(300)).toBeLessThan(spawnInterval(0));
    // Still tightening late in a run, not plateaued after the first stretch.
    expect(spawnInterval(4000)).toBeLessThan(spawnInterval(2000));
    expect(spawnInterval(1e6)).toBeGreaterThan(CONFIG.zombies.minInterval);
    expect(spawnInterval(1e6)).toBeCloseTo(CONFIG.zombies.minInterval, 2);
  });

  it('allows more zombies and bigger packs as the run goes on', () => {
    expect(maxAlive(0)).toBe(CONFIG.zombies.maxAliveStart);
    expect(maxAlive(1e6)).toBe(CONFIG.zombies.maxAliveEnd);
    expect(packFor(0)).toEqual({ chance: CONFIG.difficulty.packChanceStart, size: CONFIG.difficulty.packSizeStart });
    expect(packFor(1e6)).toEqual({ chance: CONFIG.difficulty.packChanceEnd, size: CONFIG.difficulty.packSizeEnd });
  });

  it('brings in runners only after the opening stretch', () => {
    expect(runnerChance(0)).toBe(0);
    expect(runnerChance(CONFIG.difficulty.runnerFrom)).toBe(0);
    expect(runnerChance(1000)).toBeGreaterThan(0);
    expect(runnerChance(1e6)).toBe(CONFIG.difficulty.runnerChanceMax);
  });

  it('runners are faster than any walker, and walkers speed up', () => {
    expect(zombieSpeed(1e6, 1, false)).toBeLessThan(zombieSpeed(0, 0, true));
    expect(zombieSpeed(1e6, 0.5, false)).toBeGreaterThan(zombieSpeed(0, 0.5, false));
  });

  it('player speed ramps up to the cap', () => {
    expect(playerSpeed(0)).toBe(CONFIG.player.startSpeed);
    expect(playerSpeed(1e6)).toBe(CONFIG.player.maxSpeed);
  });
});

describe('wrapAround', () => {
  it('keeps values within half of the centre', () => {
    for (const x of [-500, -31, -10, 0, 29.9, 30, 95, 1234.5]) {
      const w = wrapAround(x, 7, 30);
      expect(w).toBeGreaterThanOrEqual(7 - 30);
      expect(w).toBeLessThan(7 + 30);
      // Only ever shifts by whole periods.
      const periods = (w - x) / 60;
      expect(periods).toBeCloseTo(Math.round(periods), 9);
    }
  });

  it('leaves nearby values alone', () => {
    expect(wrapAround(12, 10, 30)).toBe(12);
  });
});

describe('stepTowards', () => {
  it('moves by speed * dt along the direction', () => {
    const r = stepTowards(0, 0, 0, -10, 2, 1);
    expect(r.x).toBeCloseTo(0);
    expect(r.z).toBeCloseTo(-2);
    expect(r.distance).toBeCloseTo(8);
  });

  it('does not overshoot the target', () => {
    expect(stepTowards(0, 0, 1, 0, 5, 1)).toEqual({ x: 1, z: 0, distance: 0 });
  });
});

describe('mulberry32', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('planCourse', () => {
  const plan = planCourse(mulberry32(3), 6000);

  it('starts each kind of event only after its first distance', () => {
    expect(plan.fences[0]).toBeGreaterThanOrEqual(CONFIG.fences.first);
    expect(plan.corn[0].start).toBe(CONFIG.corn.first);
    expect(plan.pickups[0].at).toBeGreaterThanOrEqual(CONFIG.pickups.first);
  });

  it('keeps fences sparse and out of the corn', () => {
    expect(plan.fences.length).toBeGreaterThan(3);
    for (let i = 1; i < plan.fences.length; i++) {
      expect(plan.fences[i] - plan.fences[i - 1]).toBeGreaterThanOrEqual(CONFIG.fences.gapMin);
    }
    for (const at of plan.fences) {
      expect(plan.corn.some((c) => at > c.start - 25 && at < c.end + 25)).toBe(false);
    }
  });

  it('keeps pickups out of the corn and off the running line', () => {
    for (const p of plan.pickups) {
      expect(plan.corn.some((c) => p.at > c.start - 20 && p.at < c.end + 20)).toBe(false);
      expect(Math.abs(p.x)).toBeGreaterThanOrEqual(CONFIG.pickups.offsetMin);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(CONFIG.pickups.offsetMax);
    }
  });

  it('makes corn stretches of bounded length with gaps between them', () => {
    for (const c of plan.corn) {
      expect(c.end - c.start).toBeGreaterThanOrEqual(CONFIG.corn.lengthMin);
      expect(c.end - c.start).toBeLessThanOrEqual(CONFIG.corn.lengthMax);
    }
    for (let i = 1; i < plan.corn.length; i++) {
      expect(plan.corn[i].start - plan.corn[i - 1].end).toBeGreaterThanOrEqual(CONFIG.corn.gapMin);
    }
  });
});

describe('cornCover', () => {
  const corn = [{ start: 100, end: 200 }];
  it('is 0 outside, 1 deep inside and fades at the edges', () => {
    expect(cornCover(corn, 50)).toBe(0);
    expect(cornCover(corn, 150)).toBe(1);
    expect(cornCover(corn, 103)).toBeCloseTo(0.5);
    expect(cornCover(corn, 250)).toBe(0);
  });
});

describe('vaultProfile', () => {
  it('lifts and slows the runner mid-vault and lands at full speed', () => {
    expect(vaultProfile(0)).toEqual({ lift: 0, speed: 1 });
    const mid = vaultProfile(0.42);
    expect(mid.lift).toBeGreaterThan(0.9);
    expect(mid.speed).toBeCloseTo(CONFIG.fences.vaultSpeedFactor, 1);
    expect(vaultProfile(1).speed).toBeCloseTo(1);
    expect(vaultProfile(1).lift).toBeCloseTo(0);
  });
});

describe('levels', () => {
  it('starts at the first level and climbs with distance', () => {
    expect(levelAt(0)).toBe(0);
    const last = CONFIG.levels.length - 1;
    expect(levelAt(CONFIG.levels[last].from)).toBe(last);
    expect(levelAt(1e6)).toBe(last);
    for (let i = 1; i <= last; i++) expect(levelAt(CONFIG.levels[i].from - 0.1)).toBe(i - 1);
  });

  it('introduces the horrors in order: hanged, crucified, brute, mutant, dogs', () => {
    const h = CONFIG.horrors;
    const order = [h.hanged.from, h.crucified.from, h.brute.from, h.mutant.from, h.dogs.from];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('planHorrors', () => {
  const fences = [500, 900, 1300];
  const plan = planHorrors(mulberry32(9), 8000, fences);
  const h = CONFIG.horrors;

  it('holds each horror back until its level', () => {
    expect(plan.hanged[0].at).toBeGreaterThanOrEqual(h.hanged.from);
    expect(plan.crucified[0].at).toBeGreaterThanOrEqual(h.crucified.from);
    expect(plan.brutes[0]).toBeGreaterThanOrEqual(h.brute.from);
    expect(plan.mutants[0]).toBeGreaterThanOrEqual(h.mutant.from);
    expect(plan.dogPacks[0].at).toBeGreaterThanOrEqual(h.dogs.from);
  });

  it('keeps coming, closer together late in the run', () => {
    const gaps = plan.brutes.slice(1).map((at, i) => at - plan.brutes[i]);
    expect(plan.brutes.length).toBeGreaterThan(10);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(h.brute.gapMin * (1 - h.gapShrink) - 1e-9);
    expect(gaps[gaps.length - 1]).toBeLessThanOrEqual(h.brute.gapMax * (1 - h.gapShrink) + 1e-9);
  });

  it('keeps set pieces away from fences', () => {
    for (const p of plan.hanged) for (const f of fences) expect(Math.abs(p.at - f)).toBeGreaterThanOrEqual(25);
    for (const p of plan.crucified) for (const f of fences) expect(Math.abs(p.at - f)).toBeGreaterThanOrEqual(15);
  });

  it('puts crosses off the running line and packs within size', () => {
    for (const c of plan.crucified) expect(Math.abs(c.x)).toBeGreaterThanOrEqual(h.crucified.offsetMin);
    for (const p of plan.hanged) expect(Math.abs(p.x)).toBeLessThanOrEqual(h.hanged.offsetMax);
    for (const p of plan.dogPacks) {
      expect(p.size).toBeGreaterThanOrEqual(h.dogs.packMin);
      expect(p.size).toBeLessThanOrEqual(h.dogs.packMax);
    }
  });
});

describe('cricketLevel', () => {
  it('is full when nothing is near and hushed up close', () => {
    expect(cricketLevel(1000)).toBe(1);
    expect(cricketLevel(0)).toBe(CONFIG.crickets.hushedLevel);
    expect(cricketLevel(15)).toBeGreaterThan(cricketLevel(8));
  });
});
