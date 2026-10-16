import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { Hono } from "hono";
import { db, household } from "@yoggan/db";
import { getEffectiveMember } from "../lib/members.js";
import { normalizeStore, normalizeTitle } from "../lib/normalize.js";

// Slice 4: Budgets + Expenses + Price Records (Q8, Q12, Q14, Q18, Q27).
// Spend Limit is alert-only; buying does not auto-deduct (manual Expense or receipt).
// Price Record = normalized title + store + price + date, qty=1 implied.
export const budgetsApp = new Hono();

function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return `${nextY}-${String(nextM).padStart(2, "0")}-01`;
}

// Drizzle date() columns select as Date; serialize back to YYYY-MM-DD.
function toDateString(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

budgetsApp.get("/", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const rawMonth = c.req.query("month") ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(rawMonth) || !isValidDateString(`${rawMonth}-01`)) {
    return c.json({ error: "month must be YYYY-MM" }, 400);
  }
  const monthStart = `${rawMonth}-01`;
  const nextStart = nextMonthStart(rawMonth);
  const cats = await db
    .select()
    .from(household.categories)
    .where(
      and(
        eq(household.categories.householdId, member.householdId),
        eq(household.categories.month, new Date(monthStart)),
      ),
    );
  const monthExpenses = await db
    .select()
    .from(household.expenses)
    .where(
      and(
        eq(household.expenses.householdId, member.householdId),
        gte(household.expenses.spentOn, new Date(monthStart)),
        lt(household.expenses.spentOn, new Date(nextStart)),
      ),
    );
  const spentByCategory = new Map<string, number>();
  let uncategorized = 0;
  for (const e of monthExpenses) {
    const amt = Number(e.amount);
    if (!Number.isFinite(amt)) continue;
    if (e.categoryId) {
      spentByCategory.set(e.categoryId, (spentByCategory.get(e.categoryId) ?? 0) + amt);
    } else {
      uncategorized += amt;
    }
  }
  return c.json({
    month: rawMonth,
    categories: cats.map((cat) => ({
      id: cat.id,
      name: cat.name,
      amount: cat.amount,
      spent: (spentByCategory.get(cat.id) ?? 0).toFixed(2),
    })),
    uncategorizedSpent: uncategorized.toFixed(2),
  });
});

budgetsApp.post("/categories", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  if (member.kind !== "adult") return c.json({ error: "forbidden" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; month?: unknown; amount?: unknown };
  if (typeof body.name !== "string" || body.name.trim().length === 0 || body.name.trim().length > 80) {
    return c.json({ error: "name is required (max 80 chars)" }, 400);
  }
  if (typeof body.month !== "string" || !/^\d{4}-\d{2}-01$/.test(body.month) || !isValidDateString(body.month)) {
    return c.json({ error: "month must be YYYY-MM-01" }, 400);
  }
  if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount < 0) {
    return c.json({ error: "amount must be a number >= 0" }, 400);
  }
  const category = {
    id: randomUUID(),
    householdId: member.householdId,
    name: body.name.trim(),
    month: new Date(body.month),
    amount: String(body.amount),
  };
  await db.insert(household.categories).values(category);
  return c.json({ category: { ...category, month: body.month } }, 201);
});

budgetsApp.patch("/categories/:id", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  if (member.kind !== "adult") return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");
  const rows = await db.select().from(household.categories).where(eq(household.categories.id, id)).limit(1);
  const existing = rows[0];
  if (!existing || existing.householdId !== member.householdId) {
    return c.json({ error: "not found" }, 404);
  }
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; amount?: unknown };
  const updates: { name?: string; amount?: string } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0 || body.name.trim().length > 80) {
      return c.json({ error: "name is required (max 80 chars)" }, 400);
    }
    updates.name = body.name.trim();
  }
  if (body.amount !== undefined) {
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount < 0) {
      return c.json({ error: "amount must be a number >= 0" }, 400);
    }
    updates.amount = String(body.amount);
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ error: "nothing to update" }, 400);
  }
  await db.update(household.categories).set(updates).where(eq(household.categories.id, id));
  const updated = await db.select().from(household.categories).where(eq(household.categories.id, id)).limit(1);
  const row = updated[0] ?? existing;
  return c.json({ category: { ...row, ...updates, month: toDateString(row.month) } });
});

budgetsApp.post("/expenses", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  if (member.kind !== "adult") return c.json({ error: "forbidden" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as {
    categoryId?: unknown;
    amount?: unknown;
    spentOn?: unknown;
    note?: unknown;
    receiptId?: unknown;
    listItemId?: unknown;
  };
  if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
    return c.json({ error: "amount must be a number > 0" }, 400);
  }
  if (typeof body.spentOn !== "string" || !isValidDateString(body.spentOn)) {
    return c.json({ error: "spentOn must be YYYY-MM-DD" }, 400);
  }
  const amount: number = body.amount;
  const spentOn: string = body.spentOn;
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string" || body.note.length > 500) {
      return c.json({ error: "note must be at most 500 chars" }, 400);
    }
    note = body.note;
  }
  let categoryId: string | null = null;
  if (body.categoryId !== undefined && body.categoryId !== null) {
    if (typeof body.categoryId !== "string") return c.json({ error: "category not found" }, 404);
    const catRows = await db
      .select()
      .from(household.categories)
      .where(eq(household.categories.id, body.categoryId))
      .limit(1);
    const cat = catRows[0];
    if (!cat || cat.householdId !== member.householdId) return c.json({ error: "category not found" }, 404);
    categoryId = cat.id;
  }
  let receiptId: string | null = null;
  if (body.receiptId !== undefined && body.receiptId !== null) {
    if (typeof body.receiptId !== "string") return c.json({ error: "receipt not found" }, 404);
    const receiptRows = await db
      .select()
      .from(household.receipts)
      .where(eq(household.receipts.id, body.receiptId))
      .limit(1);
    const receipt = receiptRows[0];
    if (!receipt || receipt.householdId !== member.householdId) {
      return c.json({ error: "receipt not found" }, 404);
    }
    receiptId = receipt.id;
  }
  let listItemId: string | null = null;
  let listItem: typeof household.listItems.$inferSelect | null = null;
  if (body.listItemId !== undefined && body.listItemId !== null) {
    if (typeof body.listItemId !== "string") return c.json({ error: "list item not found" }, 404);
    const itemRows = await db
      .select()
      .from(household.listItems)
      .where(eq(household.listItems.id, body.listItemId))
      .limit(1);
    const item = itemRows[0];
    if (!item) return c.json({ error: "list item not found" }, 404);
    const listRows = await db
      .select()
      .from(household.shoppingLists)
      .where(eq(household.shoppingLists.id, item.listId))
      .limit(1);
    const list = listRows[0];
    if (!list || list.householdId !== member.householdId) {
      return c.json({ error: "list item not found" }, 404);
    }
    listItemId = item.id;
    listItem = item;
  }
  const expenseId = randomUUID();
  await db.insert(household.expenses).values({
    id: expenseId,
    householdId: member.householdId,
    categoryId,
    amount: String(amount),
    spentOn: new Date(spentOn),
    note,
    receiptId,
    listItemId,
    createdByMemberId: member.id,
  });
  let priceRecorded = false;
  if (listItem) {
    await db.insert(household.priceRecords).values({
      id: randomUUID(),
      householdId: member.householdId,
      titleNorm: listItem.titleNorm,
      storeNorm: listItem.storeNorm,
      price: String(amount),
      observedOn: new Date(spentOn),
      expenseId,
    });
    priceRecorded = true;
  }
  const inserted = await db.select().from(household.expenses).where(eq(household.expenses.id, expenseId)).limit(1);
  const expense = inserted[0];
  return c.json({ expense: expense ? { ...expense, spentOn: toDateString(expense.spentOn) } : expense, priceRecorded }, 201);
});

budgetsApp.get("/prices", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const title = c.req.query("title");
  if (!title || title.trim().length === 0) {
    return c.json({ error: "title is required" }, 400);
  }
  const titleNorm = normalizeTitle(title);
  const storeNorm = normalizeStore(c.req.query("store"));
  const records = await db
    .select()
    .from(household.priceRecords)
    .where(
      and(
        eq(household.priceRecords.householdId, member.householdId),
        eq(household.priceRecords.titleNorm, titleNorm),
        ...(storeNorm !== null ? [eq(household.priceRecords.storeNorm, storeNorm)] : []),
      ),
    )
    .orderBy(desc(household.priceRecords.observedOn))
    .limit(100);
  return c.json({
    records: records.map((r) => ({
      price: r.price,
      storeNorm: r.storeNorm,
      observedOn: toDateString(r.observedOn),
    })),
  });
});
