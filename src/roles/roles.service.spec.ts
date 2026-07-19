import 'dotenv/config';
import { randomUUID } from 'crypto';
import { and, eq, ne } from 'drizzle-orm';
import { db, type Db } from '../db/db.module';
import { member, memberRole, role } from '../db/schema';
import { RbacService } from '../rbac/rbac.service';
import { RolesService } from './roles.service';

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

describe('RolesService (integration)', () => {
  const service = new RolesService(db, new RbacService());
  const suffix = randomUUID().slice(0, 8);

  it('rejects revoking superadmin from the last holder', async () => {
    const [superadminRole] = await db
      .select()
      .from(role)
      .where(eq(role.key, 'superadmin'))
      .limit(1);
    const [holder] = await db
      .select({ memberId: memberRole.memberId })
      .from(memberRole)
      .where(eq(memberRole.roleId, superadminRole.id))
      .limit(1);

    // ponytail: temporarily hides other superadmin rows inside an
    // uncommitted tx that always rolls back, so prod state never changes.
    await expectRejectionCode(
      db.transaction(async (tx) => {
        await tx
          .delete(memberRole)
          .where(
            and(
              eq(memberRole.roleId, superadminRole.id),
              ne(memberRole.memberId, holder.memberId),
            ),
          );
        const scoped = new RolesService(tx as unknown as Db, new RbacService());
        await scoped.revoke(
          holder.memberId,
          superadminRole.id,
          holder.memberId,
        );
      }),
      'last_superadmin',
    );
  });

  it('does not insert duplicate rows when granting the same unscoped role twice', async () => {
    const [teacherRole] = await db
      .select()
      .from(role)
      .where(eq(role.key, 'teacher'))
      .limit(1);
    const [m] = await db
      .insert(member)
      .values({ fullName: `__test_grant_${suffix}` })
      .returning();

    try {
      await service.grant(m.id, { roleId: teacherRole.id }, m.id);
      await service.grant(m.id, { roleId: teacherRole.id }, m.id);

      const rows = await db
        .select()
        .from(memberRole)
        .where(
          and(
            eq(memberRole.memberId, m.id),
            eq(memberRole.roleId, teacherRole.id),
          ),
        );
      expect(rows).toHaveLength(1);
    } finally {
      await db.delete(memberRole).where(eq(memberRole.memberId, m.id));
      await db.delete(member).where(eq(member.id, m.id));
    }
  });
});
