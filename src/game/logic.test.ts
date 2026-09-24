import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { applyHit, mulberry32, playerSpeed, spawnInterval, stepTowards } from './logic';

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
});

describe('difficulty curves', () => {
  it('spawn interval shrinks with distance but respects the floor', () => {
    expect(spawnInterval(0)).toBe(CONFIG.zombies.baseInterval);
    expect(spawnInterval(300)).toBeLessThan(spawnInterval(0));
    expect(spawnInterval(1e6)).toBe(CONFIG.zombies.minInterval);
  });

  it('player speed ramps up to the cap', () => {
    expect(playerSpeed(0)).toBe(CONFIG.player.startSpeed);
    expect(playerSpeed(1e6)).toBe(CONFIG.player.maxSpeed);
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
