import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { Hono } from "hono";
import { db, household } from "@yoggan/db";
import { getEffectiveMember } from "../lib/members.js";
import { normalizeStore, normalizeTitle } from "../lib/normalize.js";

// Slice 2: Lists + Stores + Spend Limit (Q9, Q12, Q29).
export const listsApp = new Hono();

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = "#22c55e";
const DEFAULT_ICON = "cart";

type DbStatus = "needed" | "in_cart" | "bought";

function toDbStatus(s: string): DbStatus | null {
  if (s === "needed" || s === "bought") return s;
  if (s === "in-cart" || s === "in_cart") return "in_cart";
  return null;
}

function toApiStatus(s: string): string {
  return s === "in_cart" ? "in-cart" : s;
}

function statusRank(s: string): number {
  if (s === "needed") return 0;
  if (s === "in_cart") return 1;
  return 2;
}

function toListJson(l: typeof household.shoppingLists.$inferSelect) {
  return {
    id: l.id,
    title: l.title,
    color: l.color,
    icon: l.icon,
    spendLimit: l.spendLimit,
    createdAt: l.createdAt,
  };
}

function toItemJson(i: typeof household.listItems.$inferSelect) {
  return {
    id: i.id,
    title: i.title,
    quantity: i.quantity,
    store: i.store,
    status: toApiStatus(i.status),
    createdAt: i.createdAt,
  };
}

async function getListInHousehold(listId: string, householdId: string) {
  const rows = await db
    .select()
    .from(household.shoppingLists)
    .where(
      and(
        eq(household.shoppingLists.id, listId),
        eq(household.shoppingLists.householdId, householdId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function parseListTitle(v: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof v !== "string" || v.trim().length === 0 || v.trim().length > 120) {
    return { ok: false };
  }
  return { ok: true, value: v.trim() };
}

function parseColor(v: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof v !== "string" || !COLOR_RE.test(v)) return { ok: false };
  return { ok: true, value: v };
}

function parseIcon(v: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof v !== "string" || v.length === 0 || v.length > 16) return { ok: false };
  return { ok: true, value: v };
}

function parseSpendLimit(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return { ok: false };
  return { ok: true, value: String(v) };
}

listsApp.get("/", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const rows = await db
    .select()
    .from(household.shoppingLists)
    .where(eq(household.shoppingLists.householdId, member.householdId))
    .orderBy(asc(household.shoppingLists.createdAt));
  return c.json({ lists: rows.map(toListJson) });
});

listsApp.post("/", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  if (member.kind !== "adult") return c.json({ error: "only adults can create lists" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: unknown;
    color?: unknown;
    icon?: unknown;
    spendLimit?: unknown;
  };
  const title = parseListTitle(body.title);
  if (!title.ok) return c.json({ error: "title is required (max 120 chars)" }, 400);
  const color =
    body.color === undefined ? { ok: true as const, value: DEFAULT_COLOR } : parseColor(body.color);
  if (!color.ok) return c.json({ error: "color must be a hex like #22c55e" }, 400);
  const icon =
    body.icon === undefined ? { ok: true as const, value: DEFAULT_ICON } : parseIcon(body.icon);
  if (!icon.ok) return c.json({ error: "icon must be at most 16 chars" }, 400);
  const spendLimit =
    body.spendLimit === undefined ? { ok: true as const, value: null } : parseSpendLimit(body.spendLimit);
  if (!spendLimit.ok) return c.json({ error: "spendLimit must be a number >= 0 or null" }, 400);
  const id = randomUUID();
  await db.insert(household.shoppingLists).values({
    id,
    householdId: member.householdId,
    title: title.value,
    color: color.value,
    icon: icon.value,
    spendLimit: spendLimit.value,
    createdByMemberId: member.id,
  });
  const created = await getListInHousehold(id, member.householdId);
  return c.json({ list: created ? toListJson(created) : { id } }, 201);
});

listsApp.patch("/:id", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  if (member.kind !== "adult") return c.json({ error: "only adults can edit lists" }, 403);
  const existing = await getListInHousehold(c.req.param("id"), member.householdId);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: unknown;
    color?: unknown;
    icon?: unknown;
    spendLimit?: unknown;
  };
  const updates: Partial<typeof household.shoppingLists.$inferInsert> = {};
  if (body.title !== undefined) {
    const t = parseListTitle(body.title);
    if (!t.ok) return c.json({ error: "title is required (max 120 chars)" }, 400);
    updates.title = t.value;
  }
  if (body.color !== undefined) {
    const col = parseColor(body.color);
    if (!col.ok) return c.json({ error: "color must be a hex like #22c55e" }, 400);
    updates.color = col.value;
  }
  if (body.icon !== undefined) {
    const ic = parseIcon(body.icon);
    if (!ic.ok) return c.json({ error: "icon must be at most 16 chars" }, 400);
    updates.icon = ic.value;
  }
  if (body.spendLimit !== undefined) {
    const sl = parseSpendLimit(body.spendLimit);
    if (!sl.ok) return c.json({ error: "spendLimit must be a number >= 0 or null" }, 400);
    updates.spendLimit = sl.value;
  }
  if (Object.keys(updates).length === 0) return c.json({ error: "nothing to update" }, 400);
  await db
    .update(household.shoppingLists)
    .set(updates)
    .where(eq(household.shoppingLists.id, existing.id));
  const updated = await getListInHousehold(existing.id, member.householdId);
  return c.json({ list: updated ? toListJson(updated) : toListJson(existing) });
});

listsApp.delete("/:id", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  if (!member.isAdmin) return c.json({ error: "only admins can delete lists" }, 403);
  const existing = await getListInHousehold(c.req.param("id"), member.householdId);
  if (!existing) return c.json({ error: "not found" }, 404);
  await db.transaction(async (tx) => {
    await tx
      .delete(household.listItems)
      .where(eq(household.listItems.listId, existing.id));
    await tx
      .delete(household.shoppingLists)
      .where(eq(household.shoppingLists.id, existing.id));
  });
  return c.json({ ok: true });
});

listsApp.get("/:id", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const list = await getListInHousehold(c.req.param("id"), member.householdId);
  if (!list) return c.json({ error: "not found" }, 404);
  const items = await db
    .select()
    .from(household.listItems)
    .where(eq(household.listItems.listId, list.id));
  items.sort((a, b) => {
    const r = statusRank(a.status) - statusRank(b.status);
    if (r !== 0) return r;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  // Month-to-date spend on this list's items, for the Spend Limit progress.
  let spentThisMonth = "0.00";
  if (items.length > 0) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const expRows = await db
      .select({ amount: household.expenses.amount })
      .from(household.expenses)
      .where(
        and(
          eq(household.expenses.householdId, member.householdId),
          inArray(
            household.expenses.listItemId,
            items.map((i) => i.id),
          ),
          gte(household.expenses.spentOn, monthStart),
          lt(household.expenses.spentOn, nextStart),
        ),
      );
    const total = expRows.reduce((sum, e) => {
      const amt = Number(e.amount);
      return Number.isFinite(amt) ? sum + amt : sum;
    }, 0);
    spentThisMonth = total.toFixed(2);
  }
  return c.json({ list: toListJson(list), items: items.map(toItemJson), spentThisMonth });
});

listsApp.post("/:id/items", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const list = await getListInHousehold(c.req.param("id"), member.householdId);
  if (!list) return c.json({ error: "not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: unknown;
    quantity?: unknown;
    store?: unknown;
  };
  if (
    typeof body.title !== "string" ||
    body.title.trim().length === 0 ||
    body.title.trim().length > 200
  ) {
    return c.json({ error: "title is required (max 200 chars)" }, 400);
  }
  let quantity = "1";
  if (body.quantity !== undefined) {
    const q = typeof body.quantity === "number" ? String(body.quantity) : body.quantity;
    if (typeof q !== "string" || q.length === 0 || q.length > 40) {
      return c.json({ error: "quantity must be at most 40 chars" }, 400);
    }
    quantity = q;
  }
  if (body.store !== undefined && body.store !== null) {
    if (typeof body.store !== "string" || body.store.length > 120) {
      return c.json({ error: "store must be at most 120 chars" }, 400);
    }
  }
  const title = body.title.trim();
  const storeRaw =
    typeof body.store === "string" && body.store.trim().length > 0 ? body.store.trim() : null;
  const id = randomUUID();
  await db.insert(household.listItems).values({
    id,
    listId: list.id,
    title,
    titleNorm: normalizeTitle(title),
    quantity,
    store: storeRaw,
    storeNorm: normalizeStore(storeRaw),
    createdByMemberId: member.id,
  });
  const rows = await db
    .select()
    .from(household.listItems)
    .where(eq(household.listItems.id, id))
    .limit(1);
  const item = rows[0];
  return c.json({ item: item ? toItemJson(item) : { id } }, 201);
});

listsApp.patch("/:id/items/:itemId", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const list = await getListInHousehold(c.req.param("id"), member.householdId);
  if (!list) return c.json({ error: "not found" }, 404);
  const itemRows = await db
    .select()
    .from(household.listItems)
    .where(
      and(
        eq(household.listItems.id, c.req.param("itemId")),
        eq(household.listItems.listId, list.id),
      ),
    )
    .limit(1);
  const item = itemRows[0];
  if (!item) return c.json({ error: "not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: unknown;
    quantity?: unknown;
    store?: unknown;
    status?: unknown;
  };
  const updates: Partial<typeof household.listItems.$inferInsert> = {};
  if (body.title !== undefined) {
    if (
      typeof body.title !== "string" ||
      body.title.trim().length === 0 ||
      body.title.trim().length > 200
    ) {
      return c.json({ error: "title is required (max 200 chars)" }, 400);
    }
    const t = body.title.trim();
    updates.title = t;
    updates.titleNorm = normalizeTitle(t);
  }
  if (body.quantity !== undefined) {
    const q = typeof body.quantity === "number" ? String(body.quantity) : body.quantity;
    if (typeof q !== "string" || q.length === 0 || q.length > 40) {
      return c.json({ error: "quantity must be at most 40 chars" }, 400);
    }
    updates.quantity = q;
  }
  if (body.store !== undefined) {
    if (body.store === null) {
      updates.store = null;
      updates.storeNorm = null;
    } else {
      if (typeof body.store !== "string" || body.store.length > 120) {
        return c.json({ error: "store must be at most 120 chars" }, 400);
      }
      const s = body.store.trim().length > 0 ? body.store.trim() : null;
      updates.store = s;
      updates.storeNorm = normalizeStore(s);
    }
  }
  if (body.status !== undefined) {
    if (typeof body.status !== "string") {
      return c.json({ error: "status must be needed|in-cart|bought" }, 400);
    }
    const dbStatus = toDbStatus(body.status);
    if (!dbStatus) return c.json({ error: "status must be needed|in-cart|bought" }, 400);
    updates.status = dbStatus;
  }
  if (Object.keys(updates).length === 0) return c.json({ error: "nothing to update" }, 400);
  await db
    .update(household.listItems)
    .set(updates)
    .where(eq(household.listItems.id, item.id));
  const refreshed = await db
    .select()
    .from(household.listItems)
    .where(eq(household.listItems.id, item.id))
    .limit(1);
  const next = refreshed[0] ?? item;
  return c.json({ item: toItemJson({ ...next, ...updates } as typeof next) });
});

listsApp.delete("/:id/items/:itemId", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const list = await getListInHousehold(c.req.param("id"), member.householdId);
  if (!list) return c.json({ error: "not found" }, 404);
  const itemRows = await db
    .select()
    .from(household.listItems)
    .where(
      and(
        eq(household.listItems.id, c.req.param("itemId")),
        eq(household.listItems.listId, list.id),
      ),
    )
    .limit(1);
  if (!itemRows[0]) return c.json({ error: "not found" }, 404);
  await db.delete(household.listItems).where(eq(household.listItems.id, itemRows[0].id));
  return c.json({ ok: true });
});
