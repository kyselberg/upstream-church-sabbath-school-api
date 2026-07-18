import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/db.module';
import * as schema from '../db/schema';

async function bootstrapMember(user: {
  id: string;
  name?: string | null;
  email: string;
}) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242)`);

    const [created] = await tx
      .insert(schema.member)
      .values({ fullName: user.name || user.email, userId: user.id })
      .onConflictDoNothing({ target: schema.member.userId })
      .returning();
    if (!created) return;

    const [superadmin] = await tx
      .select()
      .from(schema.role)
      .where(eq(schema.role.key, 'superadmin'))
      .limit(1);
    if (!superadmin) return;

    const [existingSuperadmin] = await tx
      .select({ id: schema.memberRole.id })
      .from(schema.memberRole)
      .where(eq(schema.memberRole.roleId, superadmin.id))
      .limit(1);
    if (existingSuperadmin) return;

    await tx
      .insert(schema.memberRole)
      .values({ memberId: created.id, roleId: superadmin.id });
  });
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.WEB_ORIGIN, process.env.BETTER_AUTH_URL].filter(
    (v): v is string => Boolean(v),
  ),
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
      partitioned: true,
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await bootstrapMember(user);
          } catch (err) {
            console.error('auth.databaseHooks.user.create.after failed', err);
          }
        },
      },
    },
  },
});
