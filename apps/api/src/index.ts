import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authSchema, db } from "@yoggan/db";
import { auth } from "./auth.js";
import { householdsApp } from "./routes/households.js";
import { membersApp } from "./routes/members.js";
import { listsApp } from "./routes/lists.js";
import { budgetsApp } from "./routes/budgets.js";
import { receiptsApp } from "./routes/receipts.js";
import { calendarApp } from "./routes/calendar.js";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (process.env.TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "yoggan-api" }));

// Public: is open signup still available? Only before the first user exists.
app.get("/api/auth/bootstrap", async (c) => {
  c.header('Cache-Control', 'no-store');
  const existing = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .limit(1);
  return c.json({ open: existing.length === 0 });
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api/households", householdsApp);
app.route("/api/members", membersApp);
app.route("/api/lists", listsApp);
app.route("/api/budgets", budgetsApp);
app.route("/api/receipts", receiptsApp);
app.route("/api/calendar", calendarApp);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`yoggan-api listening on :${info.port}`);
});
