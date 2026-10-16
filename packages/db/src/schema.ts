import {
  mysqlTable,
  varchar,
  text,
  int,
  tinyint,
  timestamp,
  decimal,
  date,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

// Household: single family unit per deployment (v1 = one row).
export const households = mysqlTable("households", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Member profile: Adult / Minor. Admin must be Adult (enforced in app, see CONTEXT.md).
export const members = mysqlTable("members", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("household_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull().unique(),
  kind: mysqlEnum("kind", ["adult", "minor"]).notNull(),
  isAdmin: tinyint("is_admin").notNull().default(0),
  pinHash: varchar("pin_hash", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shareable household invite links (no email for v1, Q30).
export const inviteLinks = mysqlTable("invite_links", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("household_id", { length: 36 }).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  kind: mysqlEnum("kind", ["adult", "minor"]).notNull().default("adult"),
  maxUses: int("max_uses"),
  usedCount: int("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  createdByMemberId: varchar("created_by_member_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shopping List with optional Spend Limit + customization (Q29).
export const shoppingLists = mysqlTable("shopping_lists", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("household_id", { length: 36 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  color: varchar("color", { length: 16 }).notNull().default("#22c55e"),
  icon: varchar("icon", { length: 16 }).notNull().default("cart"),
  spendLimit: decimal("spend_limit", { precision: 10, scale: 2 }),
  createdByMemberId: varchar("created_by_member_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const listItems = mysqlTable("list_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  listId: varchar("list_id", { length: 36 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  titleNorm: varchar("title_norm", { length: 200 }).notNull(),
  quantity: varchar("quantity", { length: 40 }).notNull().default("1"),
  store: varchar("store", { length: 120 }),
  storeNorm: varchar("store_norm", { length: 120 }),
  status: mysqlEnum("status", ["needed", "in_cart", "bought"]).notNull().default("needed"),
  createdByMemberId: varchar("created_by_member_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Budgets: monthly envelope per Category.
export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("household_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  month: date("month").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
});

export const expenses = mysqlTable("expenses", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("household_id", { length: 36 }).notNull(),
  categoryId: varchar("category_id", { length: 36 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  spentOn: date("spent_on").notNull(),
  note: text("note"),
  receiptId: varchar("receipt_id", { length: 36 }),
  listItemId: varchar("list_item_id", { length: 36 }),
  createdByMemberId: varchar("created_by_member_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const receipts = mysqlTable("receipts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("household_id", { length: 36 }).notNull(),
  filePath: varchar("file_path", { length: 255 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }),
  purchasedOn: date("purchased_on"),
  aiEnhanced: tinyint("ai_enhanced").notNull().default(0),
  createdByMemberId: varchar("created_by_member_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Price Record: normalized title + store + price + date (Q18).
export const priceRecords = mysqlTable("price_records", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("household_id", { length: 36 }).notNull(),
  titleNorm: varchar("title_norm", { length: 200 }).notNull(),
  storeNorm: varchar("store_norm", { length: 120 }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  observedOn: date("observed_on").notNull(),
  expenseId: varchar("expense_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
