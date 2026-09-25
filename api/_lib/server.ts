import { createClerkClient, verifyToken } from '@clerk/backend';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** Thrown to short-circuit a handler with an HTTP error. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Wraps a handler so missing config and HttpErrors become JSON responses instead of 500s with stack traces. */
export const handler = (fn: (request: Request) => Promise<Response>) => async (request: Request): Promise<Response> => {
  try {
    return await fn(request);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Internal error' }, 500);
  }
};

let db: NeonQueryFunction<false, false> | undefined;
export function sql(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new HttpError(503, 'Leaderboard is not configured');
  return (db ??= neon(url));
}

function secretKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new HttpError(503, 'Accounts are not configured');
  return key;
}

/** Verifies the Clerk session token in the Authorization header and returns the Clerk user id. */
export async function requireUser(request: Request): Promise<string> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, 'Sign in required');
  const parties = process.env.CLERK_AUTHORIZED_PARTIES?.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const claims = await verifyToken(token, { secretKey: secretKey(), authorizedParties: parties?.length ? parties : undefined });
    if (!claims.sub) throw new Error('No subject');
    return claims.sub;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, 'Invalid session');
  }
}

/** The user's public profile as Clerk has it, so names and avatars can't be spoofed by the client. */
export async function clerkUser(userId: string) {
  return createClerkClient({ secretKey: secretKey() }).users.getUser(userId);
}
