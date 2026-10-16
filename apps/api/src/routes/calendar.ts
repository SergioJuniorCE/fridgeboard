import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { google, type calendar_v3 } from "googleapis";
import { authSchema, db } from "@yoggan/db";
import { getEffectiveMember } from "../lib/members.js";

// Family Google Calendar sync.
// One shared Family Google Calendar (env FAMILY_CALENDAR_ID). Family ops run
// with the requesting effective member's own linked Google account, so the
// family calendar must be shared with each Adult's Google account. Personal
// overlay = that member's primary calendar, read-only. Minors have no Google
// linked. Client polls (5-min + on open); no server cron.
export const calendarApp = new Hono();

type GoogleAccount = typeof authSchema.account.$inferSelect;

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  source: "family" | "personal";
};

function familyCalendarId(): string | null {
  const id = process.env.FAMILY_CALENDAR_ID;
  return id && id.length > 0 ? id : null;
}

async function getGoogleAccount(userId: string): Promise<GoogleAccount | null> {
  const rows = await db
    .select()
    .from(authSchema.account)
    .where(and(eq(authSchema.account.userId, userId), eq(authSchema.account.providerId, "google")))
    .limit(1);
  return rows[0] ?? null;
}

function buildCalendar(account: GoogleAccount) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID ?? "",
    process.env.GOOGLE_CLIENT_SECRET ?? "",
  );
  oauth2.setCredentials({
    access_token: account.accessToken ?? undefined,
    refresh_token: account.refreshToken ?? undefined,
  });
  return google.calendar({ version: "v3", auth: oauth2 });
}

function googleStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { code?: unknown; status?: unknown; response?: unknown };
  if (typeof e.code === "number") return e.code;
  if (e.response && typeof e.response === "object") {
    const status = (e.response as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  if (typeof e.status === "number") return e.status;
  if (typeof e.code === "string") {
    const n = Number(e.code);
    if (Number.isInteger(n)) return n;
  }
  return undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message ?? "");
  return String(err ?? "");
}

// Token revoked/expired (refresh fails with invalid_grant). Google surfaces
// these as 401s, or 400s carrying invalid_grant.
function isRevokedError(err: unknown): boolean {
  const msg = errorMessage(err);
  if (/invalid_grant|revoked/i.test(msg)) return true;
  const status = googleStatus(err);
  if (status === 401) return true;
  if (status === 400 && /grant|token|auth|credential/i.test(msg)) return true;
  return false;
}

function mapEvent(e: calendar_v3.Schema$Event, source: CalendarEvent["source"]): CalendarEvent {
  return {
    id: e.id ?? "",
    title: e.summary ?? "",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    source,
  };
}

calendarApp.get("/events", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const calendarId = familyCalendarId();
  if (!calendarId) return c.json({ error: "family calendar not configured" }, 503);
  const fromRaw = c.req.query("from");
  const toRaw = c.req.query("to");
  const from = fromRaw ? Date.parse(fromRaw) : NaN;
  const to = toRaw ? Date.parse(toRaw) : NaN;
  if (!fromRaw || !toRaw || Number.isNaN(from) || Number.isNaN(to)) {
    return c.json({ error: "from and to are required as valid ISO dates" }, 400);
  }
  const account = await getGoogleAccount(member.userId);
  if (!account) return c.json({ error: "google not connected", action: "connect" }, 503);
  const calendar = buildCalendar(account);
  const timeMin = new Date(from).toISOString();
  const timeMax = new Date(to).toISOString();
  let family: CalendarEvent[];
  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });
    family = (res.data.items ?? []).map((e) => mapEvent(e, "family"));
  } catch (err) {
    if (isRevokedError(err)) return c.json({ error: "google revoked", action: "reconnect" }, 503);
    return c.json({ error: "google request failed" }, 502);
  }
  // Personal overlay: Adult's own primary calendar, read-only. A failure here
  // must not fail the whole request.
  const events = [...family];
  let personalSkipped = false;
  if (member.kind === "adult") {
    try {
      const res = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
      });
      for (const e of res.data.items ?? []) events.push(mapEvent(e, "personal"));
    } catch {
      personalSkipped = true;
    }
  }
  return c.json({
    events,
    familyConnected: true,
    ...(personalSkipped ? { personalSkipped: true } : {}),
  });
});

calendarApp.post("/events", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const calendarId = familyCalendarId();
  if (!calendarId) return c.json({ error: "family calendar not configured" }, 503);
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: unknown;
    start?: unknown;
    end?: unknown;
    description?: unknown;
  };
  if (typeof body.title !== "string" || body.title.trim().length === 0 || body.title.length > 200) {
    return c.json({ error: "title is required (max 200 chars)" }, 400);
  }
  if (typeof body.start !== "string" || Number.isNaN(Date.parse(body.start))) {
    return c.json({ error: "start must be a valid ISO date" }, 400);
  }
  if (typeof body.end !== "string" || Number.isNaN(Date.parse(body.end))) {
    return c.json({ error: "end must be a valid ISO date" }, 400);
  }
  if (Date.parse(body.end) <= Date.parse(body.start)) {
    return c.json({ error: "end must be after start" }, 400);
  }
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 2000)) {
    return c.json({ error: "description must be a string (max 2000 chars)" }, 400);
  }
  const account = await getGoogleAccount(member.userId);
  if (!account) return c.json({ error: "google not connected", action: "connect" }, 503);
  const calendar = buildCalendar(account);
  try {
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: body.title.trim(),
        description: typeof body.description === "string" ? body.description : undefined,
        start: { dateTime: body.start },
        end: { dateTime: body.end },
      },
    });
    const e = res.data;
    return c.json(
      {
        event: {
          id: e.id ?? "",
          title: e.summary ?? body.title.trim(),
          start: e.start?.dateTime ?? e.start?.date ?? body.start,
          end: e.end?.dateTime ?? e.end?.date ?? body.end,
        },
      },
      201,
    );
  } catch (err) {
    if (isRevokedError(err)) return c.json({ error: "google revoked", action: "reconnect" }, 503);
    return c.json({ error: "google request failed" }, 502);
  }
});

calendarApp.put("/events/:id", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  const calendarId = familyCalendarId();
  if (!calendarId) return c.json({ error: "family calendar not configured" }, 503);
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: unknown;
    start?: unknown;
    end?: unknown;
    description?: unknown;
  };
  const hasTitle = body.title !== undefined;
  const hasStart = body.start !== undefined;
  const hasEnd = body.end !== undefined;
  const hasDescription = body.description !== undefined;
  if (!hasTitle && !hasStart && !hasEnd && !hasDescription) {
    return c.json({ error: "at least one of title, start, end, description is required" }, 400);
  }
  if (hasTitle && (typeof body.title !== "string" || body.title.trim().length === 0 || body.title.length > 200)) {
    return c.json({ error: "title must be non-empty (max 200 chars)" }, 400);
  }
  if (hasStart && (typeof body.start !== "string" || Number.isNaN(Date.parse(body.start)))) {
    return c.json({ error: "start must be a valid ISO date" }, 400);
  }
  if (hasEnd && (typeof body.end !== "string" || Number.isNaN(Date.parse(body.end)))) {
    return c.json({ error: "end must be a valid ISO date" }, 400);
  }
  if (
    hasStart &&
    hasEnd &&
    typeof body.start === "string" &&
    typeof body.end === "string" &&
    Date.parse(body.end) <= Date.parse(body.start)
  ) {
    return c.json({ error: "end must be after start" }, 400);
  }
  if (hasDescription && (typeof body.description !== "string" || body.description.length > 2000)) {
    return c.json({ error: "description must be a string (max 2000 chars)" }, 400);
  }
  const account = await getGoogleAccount(member.userId);
  if (!account) return c.json({ error: "google not connected", action: "connect" }, 503);
  const calendar = buildCalendar(account);
  const eventId = c.req.param("id");
  try {
    const res = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        ...(hasTitle && typeof body.title === "string" ? { summary: body.title.trim() } : {}),
        ...(hasDescription && typeof body.description === "string" ? { description: body.description } : {}),
        ...(hasStart && typeof body.start === "string" ? { start: { dateTime: body.start } } : {}),
        ...(hasEnd && typeof body.end === "string" ? { end: { dateTime: body.end } } : {}),
      },
    });
    const e = res.data;
    return c.json({
      event: {
        id: e.id ?? eventId,
        title: e.summary ?? "",
        start: e.start?.dateTime ?? e.start?.date ?? "",
        end: e.end?.dateTime ?? e.end?.date ?? "",
      },
    });
  } catch (err) {
    if (isRevokedError(err)) return c.json({ error: "google revoked", action: "reconnect" }, 503);
    if (googleStatus(err) === 404) return c.json({ error: "event not found" }, 404);
    return c.json({ error: "google request failed" }, 502);
  }
});

calendarApp.delete("/events/:id", async (c) => {
  const member = await getEffectiveMember(c);
  if (!member) return c.json({ error: "unauthorized" }, 401);
  if (member.kind !== "adult") return c.json({ error: "forbidden" }, 403);
  const calendarId = familyCalendarId();
  if (!calendarId) return c.json({ error: "family calendar not configured" }, 503);
  const account = await getGoogleAccount(member.userId);
  if (!account) return c.json({ error: "google not connected", action: "connect" }, 503);
  const calendar = buildCalendar(account);
  try {
    await calendar.events.delete({ calendarId, eventId: c.req.param("id") });
    return c.json({ ok: true });
  } catch (err) {
    if (isRevokedError(err)) return c.json({ error: "google revoked", action: "reconnect" }, 503);
    if (googleStatus(err) === 404) return c.json({ error: "event not found" }, 404);
    return c.json({ error: "google request failed" }, 502);
  }
});
