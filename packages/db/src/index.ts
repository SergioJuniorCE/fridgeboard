import { createPool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as household from "./schema.js";
import * as authSchema from "./auth-schema.js";

export const pool = createPool({
  host: process.env.DB_HOST ?? "db",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "yoggan",
  password: process.env.DB_PASSWORD ?? "yoggan",
  database: process.env.DB_NAME ?? "yoggan",
  timezone: "Z",
  charset: "utf8mb4_unicode_ci",
  waitForConnections: true,
  connectionLimit: 10,
});

export const db = drizzle(pool, { mode: "default" });
export { household, authSchema };
