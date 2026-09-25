import { clerkUser, handler, HttpError, json, requireUser, sql } from '../_lib/server.js';
import { displayName } from '../_lib/validate.js';

/** POST /api/runs/start — opens a run for the signed-in player; the server stamps its start time. */
export const POST = handler(async (request) => {
  const userId = await requireUser(request);
  const db = sql();
  const [open] = await db`
    SELECT count(*)::int AS n FROM runs
    WHERE player_id = ${userId} AND finished_at IS NULL AND started_at > now() - interval '1 minute'`;
  if (open && open.n >= 10) throw new HttpError(429, 'Too many runs started');

  const user = await clerkUser(userId);
  await db`
    INSERT INTO players (id, display_name, image_url)
    VALUES (${userId}, ${displayName(user)}, ${user.imageUrl ?? null})
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, image_url = EXCLUDED.image_url, updated_at = now()`;
  const [run] = await db`INSERT INTO runs (player_id) VALUES (${userId}) RETURNING id`;
  return json({ runId: run!.id }, 201);
});
