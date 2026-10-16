"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin via Next.js rewrites (/api -> Hono). No absolute URL needed.
export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
