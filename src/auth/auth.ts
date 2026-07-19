import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/db.module';
import * as schema from '../db/schema';

async function sendMagicLink({ email, token }: { email: string; token: string }) {
  try {
    const link = `${process.env.WEB_ORIGIN}/login?token=${token}`;

    const [userRow] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);
    if (!userRow) return;

    const [memberRow] = await db
      .select({ telegramUserId: schema.member.telegramUserId })
      .from(schema.member)
      .where(eq(schema.member.userId, userRow.id))
      .limit(1);
    if (!memberRow?.telegramUserId) return;

    const res = await fetch(`${process.env.BOT_ANNOUNCE_URL}/internal/dm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': process.env.INTERNAL_TOKEN ?? '',
      },
      body: JSON.stringify({
        telegramUserId: memberRow.telegramUserId,
        text: `🔑 Твоє посилання для входу (діє 5 хв):\n${link}`,
      }),
    });
    if (!res.ok) {
      console.error(`sendMagicLink: bot dm failed HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('sendMagicLink failed', err);
  }
}

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
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [
    magicLink({ expiresIn: 300, disableSignUp: true, sendMagicLink }),
  ],
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
