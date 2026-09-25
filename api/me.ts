import { handler, json, requireUser, sql } from './_lib/server.js';

/** GET /api/me — the signed-in player's saved stats and leaderboard rank. */
export const GET = handler(async (request) => {
  const userId = await requireUser(request);
  const [player] = await sql()`
    SELECT display_name AS name, total_runs AS "totalRuns", total_kills AS "totalKills",
           total_headshots AS "totalHeadshots", total_distance AS "totalDistance",
           best_distance AS "bestDistance", best_kills AS "bestKills", best_headshots AS "bestHeadshots",
           CASE WHEN p.best_distance > 0 THEN (
             SELECT count(*)::int + 1 FROM players o
             WHERE o.best_distance > p.best_distance
                OR (o.best_distance = p.best_distance AND o.best_kills > p.best_kills)
           ) END AS rank
    FROM players p WHERE id = ${userId}`;
  return json({ player: player ?? null });
});
