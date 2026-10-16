import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { authSchema, db, household } from "@yoggan/db";
import { auth } from "../auth.js";

const scrypt = promisify(scryptCb);

export type Member = typeof household.members.$inferSelect;

// 30-day unlock tokens for acting as another Adult profile (shared tablet).
const UNLOCK_TTL_MS = 30 * 24 * 3600 * 1000;

function hmacSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return secret;
}

export async function getSessionUserId(c: Context): Promise<string | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session?.user?.id ?? null;
}

export async function getOwnMember(userId: string): Promise<Member | null> {
  const rows = await db
    .select()
    .from(household.members)
    .where(eq(household.members.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function signUnlockToken(memberId: string): { token: string; expiresAt: string } {
  const expiresAt = Date.now() + UNLOCK_TTL_MS;
  const payload = `${memberId}.${expiresAt}`;
  const sig = createHmac("sha256", hmacSecret()).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, expiresAt: new Date(expiresAt).toISOString() };
}

export function verifyUnlockToken(token: string, memberId: string): boolean {
  const [id, exp, sig] = token.split(".");
  if (id !== memberId || !exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = createHmac("sha256", hmacSecret()).update(`${id}.${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Effective member for this request. Defaults to the session user's own
// member. Asserting another profile via X-Active-Profile must stay inside the
// same household; asserting an Adult profile with a PIN requires a valid
// X-Profile-Unlock token. Switching to your own profile or a Minor's is free.
export async function getEffectiveMember(c: Context): Promise<Member | null> {
  const userId = await getSessionUserId(c);
  if (!userId) return null;
  const own = await getOwnMember(userId);
  if (!own) return null;
  const activeId = c.req.header("X-Active-Profile");
  if (!activeId || activeId === own.id) return own;
  const rows = await db
    .select()
    .from(household.members)
    .where(eq(household.members.id, activeId))
    .limit(1);
  const active = rows[0] ?? null;
  if (!active || active.householdId !== own.householdId) return null;
  if (active.kind === "adult" && active.pinHash) {
    try {
      if (!verifyUnlockToken(c.req.header("X-Profile-Unlock") ?? "", active.id)) return null;
    } catch {
      return null;
    }
  }
  return active;
}

export type DisplayMember = Pick<Member, "id" | "kind" | "isAdmin"> & {
  name: string;
};

// Members of a household with display names for the profile switcher.
export async function listDisplayMembers(householdId: string): Promise<DisplayMember[]> {
  const rows = await db
    .select({
      id: household.members.id,
      kind: household.members.kind,
      isAdmin: household.members.isAdmin,
      name: authSchema.user.name,
    })
    .from(household.members)
    .innerJoin(authSchema.user, eq(authSchema.user.id, household.members.userId))
    .where(eq(household.members.householdId, householdId));
  return rows.map((r) => ({ id: r.id, kind: r.kind, isAdmin: r.isAdmin, name: r.name }));
}
