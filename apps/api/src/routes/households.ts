import { randomBytes, randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { authSchema, db, household } from "@yoggan/db";
import { createAuth } from "../auth.js";
import { getEffectiveMember, getOwnMember, getSessionUserId, type Member } from "../lib/members.js";
import {withBootstrapLock} from '../lib/bootstrap-lock.js';
import {redeemInvite, registrationError} from '../lib/redeem-invite.js';

// Slice 1: Household bootstrap + shareable invite links (Q21, Q30).
// First signup creates the Household and becomes Admin Adult.
// After bootstrap, signups are invite-only: newcomers redeem a link token
// which creates their account AND their membership in one step. No SMTP for v1.
export const householdsApp = new Hono();

householdsApp.get('/setup', async c => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({error: 'unauthorized'}, 401);
  const [first] = await db.select({id: authSchema.user.id}).from(authSchema.user)
    .orderBy(asc(authSchema.user.createdAt), asc(authSchema.user.id)).limit(1);
  const [existing] = await db.select({id: household.households.id}).from(household.households).limit(1);
  return c.json({allowed: first?.id === userId && !existing});
});

householdsApp.post("/", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  if (await getOwnMember(userId)) return c.json({ error: "already in a household" }, 409);
  const { name } = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 120) {
    return c.json({ error: "name is required (max 120 chars)" }, 400);
  }
  const householdId = randomUUID();
  const memberId = randomUUID();
  await withBootstrapLock(lockedDatabase => lockedDatabase.transaction(async (tx) => {
    const [firstUser] = await tx.select({id: authSchema.user.id}).from(authSchema.user)
      .orderBy(asc(authSchema.user.createdAt), asc(authSchema.user.id)).limit(1);
    const [existingHousehold] = await tx.select({id: household.households.id}).from(household.households).limit(1);
    if (firstUser?.id !== userId || existingHousehold) {
      throw registrationError(403, 'Only the first account can set up this household. Use an invite link to join.');
    }
    await tx.insert(household.households).values({ id: householdId, name: name.trim() });
    await tx.insert(household.members).values({
      id: memberId,
      householdId,
      userId,
      kind: "adult",
      isAdmin: 1,
    });
    // Seed default lists (Q27/Q29): Supermarket + Pharmacy, fully editable.
    await tx.insert(household.shoppingLists).values([
      { id: randomUUID(), householdId, title: "Supermarket", color: "#22c55e", icon: "cart", createdByMemberId: memberId },
      { id: randomUUID(), householdId, title: "Pharmacy", color: "#3b82f6", icon: "pill", createdByMemberId: memberId },
    ]);
    // Seed default budget categories for the current month (Q27), amounts edited later.
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    await tx.insert(household.categories).values(
      ["Groceries", "Transport", "Bills", "Fun"].map((cat) => ({
        id: randomUUID(),
        householdId,
        name: cat,
        month: firstOfMonth,
        amount: "0",
      })),
    );
  }));
  return c.json(
    { household: { id: householdId, name: name.trim() }, member: { id: memberId, kind: "adult", isAdmin: 1 } },
    201,
  );
});

householdsApp.post("/join", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({error: "unauthorized"}, 401);
  const {token} = await c.req.json().catch(() => ({})) as {token?: unknown};
  if (typeof token !== "string" || !token.trim()) return c.json({error: "token is required"}, 400);
  const {member} = await redeemInvite(token.trim(), async () => ({userId}));
  return c.json({member}, 201);
});

householdsApp.post("/join-with-invite", async (c) => {
  if (await getSessionUserId(c)) return c.json({error: "Use the join action for your signed-in account."}, 409);
  const body = await c.req.json().catch(() => ({})) as {name?: unknown; email?: unknown; password?: unknown; token?: unknown};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!name || name.length > 120) return c.json({error: "name is required (max 120 chars)"}, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({error: "a valid email is required"}, 400);
  if (password.length < 8 || password.length > 128) return c.json({error: "password must be 8-128 characters"}, 400);
  if (!token) return c.json({error: "token is required"}, 400);

  const {member, response} = await redeemInvite(token, async tx => {
    const [taken] = await tx.select({id: authSchema.user.id}).from(authSchema.user)
      .where(eq(authSchema.user.email, email)).limit(1);
    if (taken) throw registrationError(409, "This email already has an account. Log in to accept your invite.");
    const response = await createAuth(tx, email).api.signUpEmail({body: {name, email, password}, asResponse: true});
    if (!response.ok) throw registrationError(400, "Could not create the account. Check your details and try again.");
    const created = await response.json() as {user?: {id?: string}};
    if (!created.user?.id) throw registrationError(500, "Could not create the account.");
    return {userId: created.user.id, response};
  });
  const headers = new Headers({"Content-Type": "application/json"});
  for (const cookie of response?.headers.getSetCookie() ?? []) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify({member}), {status: 201, headers});
});

async function requireAdmin(
  c: Context,
  householdId: string,
): Promise<{ member: Member } | { error: Response }> {
  const member = await getEffectiveMember(c);
  if (!member) return { error: c.json({ error: "unauthorized" }, 401) };
  if (member.householdId !== householdId || !member.isAdmin) {
    return { error: c.json({ error: "forbidden" }, 403) };
  }
  return { member };
}

householdsApp.get("/:id/invites", async (c) => {
  const householdId = c.req.param("id");
  const authz = await requireAdmin(c, householdId);
  if ("error" in authz) return authz.error;
  const links = await db
    .select()
    .from(household.inviteLinks)
    .where(eq(household.inviteLinks.householdId, householdId));
  return c.json({
    invites: links.map((l) => ({
      id: l.id,
      kind: l.kind,
      maxUses: l.maxUses,
      usedCount: l.usedCount,
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
    })),
  });
});

householdsApp.post("/:id/invites", async (c) => {
  const householdId = c.req.param("id");
  const authz = await requireAdmin(c, householdId);
  if ("error" in authz) return authz.error;
  const body = (await c.req.json().catch(() => ({}))) as {
    kind?: unknown;
    maxUses?: unknown;
    expiresInDays?: unknown;
  };
  if (body.kind !== "adult" && body.kind !== "minor") {
    return c.json({ error: 'kind must be "adult" or "minor"' }, 400);
  }
  const maxUses =
    body.maxUses === null || body.maxUses === undefined
      ? null
      : typeof body.maxUses === "number" && Number.isInteger(body.maxUses) && body.maxUses > 0
        ? body.maxUses
        : undefined;
  if (maxUses === undefined) return c.json({ error: "maxUses must be a positive integer or null" }, 400);
  const expiresInDays =
    body.expiresInDays === null || body.expiresInDays === undefined
      ? null
      : typeof body.expiresInDays === "number" && body.expiresInDays > 0
        ? body.expiresInDays
        : undefined;
  if (expiresInDays === undefined) return c.json({ error: "expiresInDays must be positive or null" }, 400);
  const token = randomBytes(24).toString("base64url");
  const id = randomUUID();
  await db.insert(household.inviteLinks).values({
    id,
    householdId,
    token,
    kind: body.kind,
    maxUses,
    expiresAt: expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 86400000),
    createdByMemberId: authz.member.id,
  });
  return c.json({ invite: { id, token, kind: body.kind, maxUses }, joinPath: `/join?token=${token}` }, 201);
});
