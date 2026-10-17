import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { authSchema, db } from "@yoggan/db";
import {APIError} from 'better-auth/api';
import {withBootstrapLock} from './lib/bootstrap-lock.js';

type AuthDatabase = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

function accountAdapter(database: AuthDatabase, invitedEmail?: string, transactionActive = false): ReturnType<typeof drizzleAdapter> {
  const factory = drizzleAdapter(database, {provider: 'mysql', schema: authSchema, usePlural: false, transaction: false});
  return options => {
    const adapter = factory(options);
    const create: typeof adapter.create = async (input) => {
      if (input.model !== 'user') return originalCreate(input);
      if (invitedEmail && String(input.data.email).toLowerCase() === invitedEmail) {
        return originalCreate(input);
      }
      if (transactionActive) {
        const existing = await database.select({id: authSchema.user.id}).from(authSchema.user).limit(1);
        if (existing.length) throw new APIError('FORBIDDEN', {message: 'An invitation is required to create an account.'});
        return originalCreate(input);
      }
      return withBootstrapLock(lockedDatabase => accountAdapter(lockedDatabase, undefined, true)(options).create(input));
    };
    const originalCreate = adapter.create.bind(adapter);
    // The library's transaction callback closes over this same adapter instance.
    adapter.create = create;
    if (!invitedEmail && !transactionActive) {
      adapter.transaction = callback => withBootstrapLock(lockedDatabase =>
        lockedDatabase.transaction(tx => callback(accountAdapter(tx, undefined, true)(options))));
    }
    return adapter;
  };
}

// Invite auth is constructed inside the invite's transaction. Its permission
// belongs only to that invocation and email, never to another request.
export function createAuth(database: AuthDatabase = db, invitedEmail?: string) {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),
    database: accountAdapter(database, invitedEmail),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        enabled: Boolean(process.env.GOOGLE_CLIENT_ID),
        scope: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar"],
      },
    },
    plugins: [],
    // Use the adapter's standard queries with this MariaDB schema. Experimental
    // relational joins require a separate relational-query configuration.
    advanced: { database: { joins: false } },
  });
}

export const auth = createAuth();
