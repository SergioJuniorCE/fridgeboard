import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import sharp from "sharp";
import { db, household } from "@yoggan/db";
import { getEffectiveMember } from "../lib/members.js";
import { normalizeTitle } from "../lib/normalize.js";

// Slice 4: Receipts (Q13, Q23, Q31).
// v1: photo stored downscaled to longest edge 1600px, <=10MB, served from
// the uploads volume. Opt-in per-tap Enhance sends the photo to the
// configured AI model to pre-fill total/date/items.
export const receiptsApp = new Hono();

const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
const MAX_BYTES = 10 * 1024 * 1024;

function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

function contentTypeFor(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

// Drizzle date() columns select as Date; serialize back to YYYY-MM-DD.
function toDateString(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function formatReceipt<T extends { purchasedOn: Date | string | null }>(receipt: T) {
  return { ...receipt, purchasedOn: receipt.purchasedOn === null ? null : toDateString(receipt.purchasedOn) };
}

receiptsApp.post("/", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "photo is required" }, 400);
  }
  const photo = form.get("photo");
  if (!(photo instanceof File)) {
    return c.json({ error: "photo is required" }, 400);
  }
  if (photo.size > MAX_BYTES) {
    return c.json({ error: "photo must be at most 10MB" }, 413);
  }
  let ext: string;
  if (photo.type === "image/jpeg" || photo.type === "image/jpg") ext = ".jpg";
  else if (photo.type === "image/png") ext = ".png";
  else if (photo.type === "image/webp") ext = ".webp";
  else return c.json({ error: "photo must be jpg, png, or webp" }, 400);
  const input = Buffer.from(await photo.arrayBuffer());
  const resized = sharp(input).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  const output =
    ext === ".png"
      ? await resized.png().toBuffer()
      : ext === ".webp"
        ? await resized.webp({ quality: 80 }).toBuffer()
        : await resized.jpeg({ quality: 80 }).toBuffer();
  const filename = `${randomUUID()}${ext}`;
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), output);
  const id = randomUUID();
  await db.insert(household.receipts).values({
    id,
    householdId: member.householdId,
    filePath: filename,
    total: null,
    purchasedOn: null,
    aiEnhanced: 0,
    createdByMemberId: member.id,
  });
  return c.json({ receipt: { id, filePath: filename } }, 201);
});

receiptsApp.patch("/:id", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const rows = await db.select().from(household.receipts).where(eq(household.receipts.id, id)).limit(1);
  const existing = rows[0];
  if (!existing || existing.householdId !== member.householdId) {
    return c.json({ error: "not found" }, 404);
  }
  const body = (await c.req.json().catch(() => ({}))) as { total?: unknown; purchasedOn?: unknown };
  const updates: { total?: string | null; purchasedOn?: Date | null } = {};
  if (body.total !== undefined) {
    if (typeof body.total !== "number" || !Number.isFinite(body.total) || body.total <= 0) {
      return c.json({ error: "total must be a number > 0" }, 400);
    }
    updates.total = String(body.total);
  }
  if (body.purchasedOn !== undefined) {
    if (typeof body.purchasedOn !== "string" || !isValidDateString(body.purchasedOn)) {
      return c.json({ error: "purchasedOn must be YYYY-MM-DD" }, 400);
    }
    updates.purchasedOn = new Date(body.purchasedOn);
  }
  if (Object.keys(updates).length > 0) {
    await db.update(household.receipts).set(updates).where(eq(household.receipts.id, id));
  }
  const updated = await db.select().from(household.receipts).where(eq(household.receipts.id, id)).limit(1);
  return c.json({ receipt: formatReceipt(updated[0] ?? existing) });
});

receiptsApp.get("/:id/file", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const rows = await db.select().from(household.receipts).where(eq(household.receipts.id, id)).limit(1);
  const receipt = rows[0];
  if (!receipt || receipt.householdId !== member.householdId) {
    return c.json({ error: "not found" }, 404);
  }
  let data: Buffer;
  try {
    data = await readFile(join(uploadDir, receipt.filePath));
  } catch {
    return c.json({ error: "not found" }, 404);
  }
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: { "Content-Type": contentTypeFor(receipt.filePath) },
  });
});

receiptsApp.post("/:id/enhance", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return c.json({ error: "receipt AI not configured" }, 503);
  const id = c.req.param("id");
  const rows = await db.select().from(household.receipts).where(eq(household.receipts.id, id)).limit(1);
  const receipt = rows[0];
  if (!receipt || receipt.householdId !== member.householdId) {
    return c.json({ error: "not found" }, 404);
  }
  let data: Buffer;
  try {
    data = await readFile(join(uploadDir, receipt.filePath));
  } catch {
    return c.json({ error: "not found" }, 404);
  }
  const mime = contentTypeFor(receipt.filePath);
  const b64 = data.toString("base64");
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              'You extract receipt data. Always respond with strict JSON only, no markdown, shaped as {"total": number|null, "purchasedOn": "YYYY-MM-DD"|null, "items": [{"title": string, "price": number}]}.',
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: 'Read this receipt photo and return strict JSON: {"total": <receipt total as a number or null>, "purchasedOn": <purchase date as YYYY-MM-DD or null>, "items": [{"title": <item name>, "price": <item price as a number>}]}. Use null when unknown.',
              },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return c.json({ error: "ai enhance failed" }, 502);
    const payload = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    } | null;
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      return c.json({ error: "ai enhance failed" }, 502);
    }
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null) {
      return c.json({ error: "ai enhance failed" }, 502);
    }
    const { total: rawTotal, purchasedOn: rawPurchasedOn, items: rawItems } = parsed as {
      total?: unknown;
      purchasedOn?: unknown;
      items?: unknown;
    };
    const total =
      typeof rawTotal === "number" && Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : null;
    const purchasedOn =
      typeof rawPurchasedOn === "string" && isValidDateString(rawPurchasedOn) ? rawPurchasedOn : null;
    const items: Array<{ title: string; price: number }> = [];
    if (Array.isArray(rawItems)) {
      for (const entry of rawItems) {
        if (typeof entry !== "object" || entry === null) continue;
        const { title, price } = entry as { title?: unknown; price?: unknown };
        if (typeof title !== "string" || title.trim().length === 0) continue;
        if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
        items.push({ title: title.trim(), price });
      }
    }
    await db
      .update(household.receipts)
      .set({
        ...(total !== null ? { total: String(total) } : {}),
        ...(purchasedOn !== null ? { purchasedOn: new Date(purchasedOn) } : {}),
        aiEnhanced: 1,
      })
      .where(eq(household.receipts.id, id));
    const observedOn = purchasedOn ?? new Date().toISOString().slice(0, 10);
    if (items.length > 0) {
      await db.insert(household.priceRecords).values(
        items.map((item) => ({
          id: randomUUID(),
          householdId: member.householdId,
          titleNorm: normalizeTitle(item.title),
          storeNorm: null,
          price: String(item.price),
          observedOn: new Date(observedOn),
          expenseId: null,
        })),
      );
    }
    return c.json({ total, purchasedOn, items });
  } catch {
    return c.json({ error: "ai enhance failed" }, 502);
  }
});
