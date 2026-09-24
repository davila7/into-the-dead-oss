import { describe, expect, it } from 'vitest';
import { bulletCamDue, flightTime } from './BulletCam';
import { CONFIG } from './config';

const cfg = CONFIG.bulletCam;
const far = cfg.minDistance + 10;

describe('bulletCamDue', () => {
  it('never plays on a headshot too close to follow', () => {
    expect(bulletCamDue(1000, 0, cfg.minDistance - 0.1, 0)).toBe(false);
    expect(bulletCamDue(1000, 0, cfg.minDistance - 0.1, 0, true)).toBe(false);
  });

  it('waits for its cooldown, then plays on a lucky roll', () => {
    expect(bulletCamDue(cfg.firstAfter - 1, cfg.firstAfter, far, 0)).toBe(false);
    expect(bulletCamDue(cfg.firstAfter, cfg.firstAfter, far, 0)).toBe(true);
    expect(bulletCamDue(cfg.firstAfter, cfg.firstAfter, far, cfg.chance)).toBe(false);
  });

  it('plays on every headshot when forced', () => {
    expect(bulletCamDue(0, cfg.firstAfter, far, 0.99, true)).toBe(true);
  });
});

describe('flightTime', () => {
  it('grows with distance within its bounds', () => {
    expect(flightTime(0)).toBe(cfg.flightMin);
    expect(flightTime(1000)).toBe(cfg.flightMax);
    expect(flightTime(22)).toBeGreaterThan(flightTime(20));
  });
});
