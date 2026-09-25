import { handler, json, sql } from './_lib/server.js';

/** GET /api/leaderboard — top players by their best run. Public. */
export const GET = handler(async () => {
  const rows = await sql()`
    SELECT display_name AS name, image_url AS image, best_distance AS distance,
           best_kills AS kills, best_headshots AS headshots, best_at AS at
    FROM players
    WHERE best_distance > 0
    ORDER BY best_distance DESC, best_kills DESC, best_at ASC
    LIMIT 20`;
  return json({ entries: rows }, 200, { 'cache-control': 'public, s-maxage=15, stale-while-revalidate=60' });
});
