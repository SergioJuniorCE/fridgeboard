import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { db, household } from "@yoggan/db";
import { getEffectiveMember, getOwnMember, getSessionUserId, type Member } from "../lib/members.js";

// Slice 1: Household bootstrap + shareable invite links (Q21, Q30).
// First signup creates the Household and becomes Admin Adult.
// Others sign up, then redeem a link token to join. No SMTP for v1.
export const householdsApp = new Hono();

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
  await db.transaction(async (tx) => {
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
  });
  return c.json(
    { household: { id: householdId, name: name.trim() }, member: { id: memberId, kind: "adult", isAdmin: 1 } },
    201,
  );
});

householdsApp.post("/join", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  if (await getOwnMember(userId)) return c.json({ error: "already in a household" }, 409);
  const { token } = (await c.req.json().catch(() => ({}))) as { token?: unknown };
  if (typeof token !== "string" || token.length === 0) {
    return c.json({ error: "token is required" }, 400);
  }
  const links = await db
    .select()
    .from(household.inviteLinks)
    .where(eq(household.inviteLinks.token, token))
    .limit(1);
  const link = links[0];
  if (!link) return c.json({ error: "invalid link" }, 404);
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return c.json({ error: "link expired" }, 410);
  }
  if (link.maxUses !== null && link.usedCount >= link.maxUses) {
    return c.json({ error: "link fully used" }, 410);
  }
  const memberId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(household.members).values({
      id: memberId,
      householdId: link.householdId,
      userId,
      kind: link.kind,
      isAdmin: 0,
    });
    await tx
      .update(household.inviteLinks)
      .set({ usedCount: link.usedCount + 1 })
      .where(eq(household.inviteLinks.id, link.id));
  });
  return c.json({ member: { id: memberId, kind: link.kind, householdId: link.householdId } }, 201);
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
