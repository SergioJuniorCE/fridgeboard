import type { Config } from "drizzle-kit";

export default {
  schema: ["./src/schema.ts", "./src/auth-schema.ts"],
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.DB_HOST ?? "db",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "yoggan",
    password: process.env.DB_PASSWORD ?? "yoggan",
    database: process.env.DB_NAME ?? "yoggan",
  },
} satisfies Config;
