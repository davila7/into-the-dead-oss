import { handler, HttpError, json, requireUser, sql } from '../_lib/server.js';
import { validateRun } from '../_lib/validate.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/runs/finish — records a run's stats once, checked against the server's own clock. */
export const POST = handler(async (request) => {
  const userId = await requireUser(request);
  const body = (await request.json().catch(() => null)) as { runId?: unknown } | null;
  const runId = body?.runId;
  if (typeof runId !== 'string' || !UUID.test(runId)) throw new HttpError(400, 'Invalid run');

  const db = sql();
  const [run] = await db`
    SELECT extract(epoch FROM now() - started_at)::float8 AS elapsed, finished_at
    FROM runs WHERE id = ${runId} AND player_id = ${userId}`;
  if (!run) throw new HttpError(404, 'Run not found');
  if (run.finished_at) throw new HttpError(409, 'Run already recorded');

  const check = validateRun(body, run.elapsed as number);
  if (!check.ok) throw new HttpError(422, check.error);
  const { distance, kills, headshots } = check.stats;

  // Claiming the run (finished_at IS NULL) and updating the totals happen in one statement, so a run counts once.
  const [player] = await db`
    WITH r AS (
      UPDATE runs SET finished_at = now(), distance = ${distance}, kills = ${kills}, headshots = ${headshots}
      WHERE id = ${runId} AND player_id = ${userId} AND finished_at IS NULL
      RETURNING player_id, distance, kills, headshots,
        (distance, kills) > (SELECT best_distance, best_kills FROM players WHERE id = ${userId}) AS better
    )
    UPDATE players p SET
      total_runs = total_runs + 1,
      total_kills = total_kills + r.kills,
      total_headshots = total_headshots + r.headshots,
      total_distance = total_distance + r.distance,
      best_distance = CASE WHEN r.better THEN r.distance ELSE best_distance END,
      best_kills = CASE WHEN r.better THEN r.kills ELSE best_kills END,
      best_headshots = CASE WHEN r.better THEN r.headshots ELSE best_headshots END,
      best_at = CASE WHEN r.better THEN now() ELSE best_at END,
      updated_at = now()
    FROM r WHERE p.id = r.player_id
    RETURNING r.better AS "newBest", p.best_distance AS "bestDistance"`;
  if (!player) throw new HttpError(409, 'Run already recorded');

  const [{ rank }] = (await db`
    SELECT count(*)::int + 1 AS rank FROM players o, players p
    WHERE p.id = ${userId}
      AND (o.best_distance > p.best_distance OR (o.best_distance = p.best_distance AND o.best_kills > p.best_kills))`) as [
    { rank: number },
  ];
  return json({ newBest: player.newBest, bestDistance: player.bestDistance, rank });
});
