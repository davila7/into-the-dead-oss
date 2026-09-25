import type { RunStats } from '../game/Hud';

export interface LeaderboardEntry {
  name: string;
  image: string | null;
  distance: number;
  kills: number;
  headshots: number;
}

export interface RunResult {
  newBest: boolean;
  bestDistance: number;
  rank: number;
}

async function call<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers });
  const type = res.headers.get('content-type') ?? '';
  // Without the API (plain `vite` dev, or not configured) the path falls through to index.html or a 404/503.
  if (!res.ok || !type.includes('application/json')) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchLeaderboard = () => call<{ entries: LeaderboardEntry[] }>('/api/leaderboard').then((r) => r.entries);

export const startRun = (token: string) => call<{ runId: string }>('/api/runs/start', { method: 'POST' }, token).then((r) => r.runId);

export const finishRun = (token: string, runId: string, stats: RunStats) =>
  call<RunResult>('/api/runs/finish', { method: 'POST', body: JSON.stringify({ runId, ...stats }) }, token);
