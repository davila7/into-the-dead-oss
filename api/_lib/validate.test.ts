import { describe, expect, it } from 'vitest';
import { displayName, validateRun } from './validate';

describe('validateRun', () => {
  it('accepts an honest run and rounds distance', () => {
    expect(validateRun({ distance: 512.345, kills: 40, headshots: 12 }, 90)).toEqual({
      ok: true,
      stats: { distance: 512.3, kills: 40, headshots: 12 },
    });
  });

  it('rejects distance the runner could not cover in the time', () => {
    expect(validateRun({ distance: 2000, kills: 0, headshots: 0 }, 60).ok).toBe(false);
  });

  it('rejects impossible kill counts and more headshots than kills', () => {
    expect(validateRun({ distance: 10, kills: 500, headshots: 0 }, 10).ok).toBe(false);
    expect(validateRun({ distance: 10, kills: 2, headshots: 3 }, 10).ok).toBe(false);
  });

  it('rejects malformed bodies', () => {
    expect(validateRun(null, 10).ok).toBe(false);
    expect(validateRun({ distance: 'far', kills: 1, headshots: 0 }, 10).ok).toBe(false);
    expect(validateRun({ distance: 10, kills: 1.5, headshots: 0 }, 10).ok).toBe(false);
    expect(validateRun({ distance: Infinity, kills: 1, headshots: 0 }, 10).ok).toBe(false);
  });

  it('rejects runs left open too long', () => {
    expect(validateRun({ distance: 10, kills: 1, headshots: 0 }, 4 * 3600).ok).toBe(false);
  });
});

describe('displayName', () => {
  it('prefers username, then first name and last initial', () => {
    expect(displayName({ username: 'dani', firstName: 'Daniel' })).toBe('dani');
    expect(displayName({ firstName: 'Daniel', lastName: 'Avila' })).toBe('Daniel A.');
    expect(displayName({})).toBe('Survivor');
  });
});
