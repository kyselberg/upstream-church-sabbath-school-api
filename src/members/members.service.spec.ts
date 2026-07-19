import 'dotenv/config';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/db.module';
import { member, memberRole, role, user } from '../db/schema';
import { RbacService } from '../rbac/rbac.service';
import { MembersService } from './members.service';

async function expectRejectionCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (e) {
    expect(
      (e as { getResponse?: () => unknown }).getResponse?.(),
    ).toMatchObject({ code });
    return;
  }
  throw new Error(`expected rejection with code ${code}`);
}

describe('MembersService.remove (integration)', () => {
  const service = new MembersService(db, new RbacService());
  const suffix = randomUUID().slice(0, 8);

  it('deleting a member with a userId also deletes the better-auth user row', async () => {
    const userId = `__test_user_${suffix}`;
    await db.insert(user).values({ id: userId, email: `${userId}@test.local` });
    const [m] = await db
      .insert(member)
      .values({ fullName: `__test_member_${suffix}`, userId })
      .returning();

    const deleted = await service.remove(m.id);
    expect(deleted.id).toBe(m.id);

    const [remainingUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, userId));
    expect(remainingUser).toBeUndefined();
  });

  it('refuses to delete a superadmin member', async () => {
    const [superadminRole] = await db
      .select()
      .from(role)
      .where(eq(role.key, 'superadmin'))
      .limit(1);
    const [m] = await db
      .insert(member)
      .values({ fullName: `__test_super_${suffix}` })
      .returning();
    await db
      .insert(memberRole)
      .values({ memberId: m.id, roleId: superadminRole.id });

    try {
      await expectRejectionCode(
        service.remove(m.id),
        'cannot_delete_superadmin',
      );

      const [stillThere] = await db
        .select()
        .from(member)
        .where(eq(member.id, m.id));
      expect(stillThere).toBeDefined();
    } finally {
      await db.delete(memberRole).where(eq(memberRole.memberId, m.id));
      await db.delete(member).where(eq(member.id, m.id));
    }
  });
});
