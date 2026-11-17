import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "./db";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const SESSION_TTL_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type SessionInfo = { userId: string; sessionId: string };

/** Create a session for a user; returns the opaque bearer token.
 *  Pass a client (transaction) when the user row is being created in the same transaction. */
export async function createSession(userId: string, client?: { query: typeof pool.query }): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await (client ?? pool).query(
    `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`,
    [userId, sha256(token), expires]
  );
  return token;
}

/** Resolve a bearer token to a user id. Expired/invalid -> null. */
export async function resolveToken(token: string | undefined | null): Promise<SessionInfo | null> {
  if (!token) return null;
  const { rows } = await pool.query(
    `select s.id, s.user_id, s.expires_at, s.last_seen_at
       from sessions s
      where s.token_hash = $1`,
    [sha256(token)]
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query("delete from sessions where id = $1", [row.id]);
    return null;
  }
  // Sliding refresh, throttled to one write per hour per session so hot
  // request paths don't pay a pointless UPDATE on every call.
  const lastSeen = new Date(row.last_seen_at ?? 0).getTime();
  if (Date.now() - lastSeen > 60 * 60 * 1000) {
    pool
      .query(
        "update sessions set last_seen_at = now(), expires_at = $2 where id = $1",
        [row.id, new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000)]
      )
      .catch(() => {});
  }
  return { userId: row.user_id, sessionId: row.id };
}

export async function destroySession(sessionId: string): Promise<void> {
  await pool.query("delete from sessions where id = $1", [sessionId]);
}

export async function destroyUserSessions(userId: string): Promise<void> {
  await pool.query("delete from sessions where user_id = $1", [userId]);
}

/** For the dev-experience password reset flow (no email service configured). */
export async function createPasswordReset(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await pool.query(
    `delete from password_resets where user_id = $1 and used_at is null;
     insert into password_resets (user_id, token_hash, expires_at)
     values ($1, $2, now() + interval '1 hour')`,
    [userId, sha256(token)]
  );
  return token;
}

export async function consumePasswordReset(token: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select id, user_id from password_resets
      where token_hash = $1 and used_at is null and expires_at > now()`,
    [sha256(token)]
  );
  const row = rows[0];
  if (!row) return null;
  await pool.query("update password_resets set used_at = now() where id = $1", [row.id]);
  return row.user_id;
}
