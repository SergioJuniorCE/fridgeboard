import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {HTTPException} from 'hono/http-exception';
import {db, household} from '@yoggan/db';

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function registrationError(status: 400 | 403 | 404 | 409 | 410 | 500, error: string) {
  return new HTTPException(status, {res: Response.json({error}, {status})});
}

export async function redeemInvite(token: string, createUser: (tx: Transaction) => Promise<{userId: string; response?: Response}>) {
  return db.transaction(async tx => {
    const [link] = await tx.select().from(household.inviteLinks)
      .where(eq(household.inviteLinks.token, token)).limit(1).for('update');
    if (!link) throw registrationError(404, 'Invalid invite link.');
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) throw registrationError(410, 'This invite link has expired.');
    if (link.maxUses !== null && link.usedCount >= link.maxUses) throw registrationError(410, 'This invite link has been fully used.');

    // For newcomers, all Better Auth writes use this same transaction. A failed
    // credential, session, or membership write leaves no account or used invite.
    const {userId, response} = await createUser(tx);
    const [existing] = await tx.select({id: household.members.id}).from(household.members)
      .where(eq(household.members.userId, userId)).limit(1);
    if (existing) throw registrationError(409, 'You already belong to a household.');
    const member = {id: randomUUID(), householdId: link.householdId, userId, kind: link.kind, isAdmin: 0};
    await tx.insert(household.members).values(member);
    await tx.update(household.inviteLinks).set({usedCount: link.usedCount + 1})
      .where(eq(household.inviteLinks.id, link.id));
    return {member: {id: member.id, kind: member.kind, householdId: member.householdId}, response};
  });
}
