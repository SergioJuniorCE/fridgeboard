import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, household } from "@yoggan/db";
import {
  getEffectiveMember,
  getOwnMember,
  getSessionUserId,
  hashPin,
  listDisplayMembers,
  signUnlockToken,
  verifyPin,
} from "../lib/members.js";

// Slice 1: profile switcher support + Adult PIN (Q20).
// - GET / lists household members with display names.
// - POST /me/pin lets an Adult set their own PIN (4-12 digits).
// - POST /:id/verify-pin checks a PIN and returns an unlock token that the
//   client sends as X-Profile-Unlock when acting as that Adult profile.
export const membersApp = new Hono();

membersApp.get("/", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  return c.json({ members: await listDisplayMembers(member.householdId) });
});

membersApp.get("/me", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const own = await getOwnMember(userId);
  if (!own) return c.json({ error: "no member profile" }, 404);
  return c.json({
    member: { id: own.id, kind: own.kind, isAdmin: own.isAdmin, householdId: own.householdId },
  });
});

membersApp.post("/me/pin", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const own = await getOwnMember(userId);
  if (!own) return c.json({ error: "no member profile" }, 404);
  if (own.kind !== "adult") return c.json({ error: "only adults can set a PIN" }, 403);
  const { pin } = (await c.req.json().catch(() => ({}))) as { pin?: unknown };
  if (typeof pin !== "string" || !/^\d{4,12}$/.test(pin)) {
    return c.json({ error: "pin must be 4-12 digits" }, 400);
  }
  await db
    .update(household.members)
    .set({ pinHash: await hashPin(pin) })
    .where(eq(household.members.id, own.id));
  return c.json({ ok: true });
});

membersApp.post("/:id/verify-pin", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const own = await getOwnMember(userId);
  if (!own) return c.json({ error: "no member profile" }, 404);
  const rows = await db
    .select()
    .from(household.members)
    .where(eq(household.members.id, c.req.param("id")))
    .limit(1);
  const target = rows[0];
  if (!target || target.householdId !== own.householdId) {
    return c.json({ error: "not found" }, 404);
  }
  if (target.kind !== "adult") return c.json({ error: "minors need no PIN" }, 400);
  if (!target.pinHash) return c.json({ error: "no PIN set for this profile" }, 409);
  const { pin } = (await c.req.json().catch(() => ({}))) as { pin?: unknown };
  if (typeof pin !== "string" || !(await verifyPin(pin, target.pinHash))) {
    return c.json({ error: "wrong PIN" }, 401);
  }
  try {
    return c.json(signUnlockToken(target.id));
  } catch {
    return c.json({ error: "unlock unavailable (server misconfigured)" }, 503);
  }
});
