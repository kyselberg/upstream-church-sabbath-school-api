import 'dotenv/config';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/db.module';
import { assignment, classTeacher, klass, member } from '../db/schema';
import { ClassesService } from './classes.service';

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

describe('ClassesService (integration)', () => {
  const service = new ClassesService(db);
  const suffix = randomUUID().slice(0, 8);

  it('refuses to delete a class that has assignments', async () => {
    const [c] = await db
      .insert(klass)
      .values({ name: `__test_class_${suffix}`, sortOrder: 999 })
      .returning();
    await db.insert(assignment).values({ classId: c.id, date: '2099-01-01' });

    try {
      await expectRejectionCode(service.remove(c.id), 'class_has_assignments');
    } finally {
      await db.delete(assignment).where(eq(assignment.classId, c.id));
      await db.delete(klass).where(eq(klass.id, c.id));
    }
  });

  it('clears originalMemberId on future assignments when the original owner leaves the pool', async () => {
    const [c] = await db
      .insert(klass)
      .values({ name: `__test_class2_${suffix}`, sortOrder: 998 })
      .returning();
    const [owner, sub] = await db
      .insert(member)
      .values([
        { fullName: `__test_owner_${suffix}` },
        { fullName: `__test_sub_${suffix}` },
      ])
      .returning();
    await db.insert(classTeacher).values([
      { classId: c.id, memberId: owner.id },
      { classId: c.id, memberId: sub.id },
    ]);
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const [a] = await db
      .insert(assignment)
      .values({
        classId: c.id,
        date: future,
        memberId: sub.id,
        originalMemberId: owner.id,
      })
      .returning();

    try {
      await service.removeTeacher(c.id, owner.id, true);

      const [row] = await db
        .select()
        .from(assignment)
        .where(eq(assignment.id, a.id));
      expect(row.originalMemberId).toBeNull();
      expect(row.memberId).toBe(sub.id);
    } finally {
      await db.delete(assignment).where(eq(assignment.classId, c.id));
      await db.delete(classTeacher).where(eq(classTeacher.classId, c.id));
      await db.delete(member).where(eq(member.id, owner.id));
      await db.delete(member).where(eq(member.id, sub.id));
      await db.delete(klass).where(eq(klass.id, c.id));
    }
  });
});
