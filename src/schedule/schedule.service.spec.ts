import 'dotenv/config';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { saturdaysBetween } from '../common/dates';
import { db } from '../db/db.module';
import {
  appSettings,
  assignment,
  assignmentChange,
  classTeacher,
  klass,
  member,
} from '../db/schema';
import { ScheduleService } from './schedule.service';

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

describe('ScheduleService (integration)', () => {
  const service = new ScheduleService(db);
  const suffix = randomUUID().slice(0, 8);

  let classId: string;
  let m1: string;
  let m2: string;
  let m3: string;
  let assignmentA: string;
  let assignmentB: string;

  beforeAll(async () => {
    const [c] = await db
      .insert(klass)
      .values({ name: `__test_class_${suffix}`, sortOrder: 999 })
      .returning();
    classId = c.id;

    const members = await db
      .insert(member)
      .values([
        { fullName: `__test_m1_${suffix}` },
        { fullName: `__test_m2_${suffix}` },
        { fullName: `__test_m3_${suffix}` },
      ])
      .returning();
    [m1, m2, m3] = members.map((m) => m.id);

    await db.insert(classTeacher).values([
      { classId, memberId: m1 },
      { classId, memberId: m2 },
      { classId, memberId: m3 },
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const [d1, d2] = saturdaysBetween(today, future);

    const rows = await db
      .insert(assignment)
      .values([
        { classId, date: d1, status: 'planned' },
        { classId, date: d2, status: 'planned' },
      ])
      .returning();
    assignmentA = rows[0].id;
    assignmentB = rows[1].id;
  });

  afterAll(async () => {
    await db.delete(klass).where(eq(klass.id, classId));
    await db.delete(member).where(eq(member.id, m1));
    await db.delete(member).where(eq(member.id, m2));
    await db.delete(member).where(eq(member.id, m3));
  });

  it('swap happy path exchanges memberIds and writes 2 linked change rows', async () => {
    await db
      .update(assignment)
      .set({ memberId: m1 })
      .where(eq(assignment.id, assignmentA));
    await db
      .update(assignment)
      .set({ memberId: m2 })
      .where(eq(assignment.id, assignmentB));

    const { swapGroupId } = await service.swap(assignmentA, assignmentB, {
      actorMemberId: m1,
      source: 'system',
      canAssignAny: true,
    });

    const [aRow] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentA));
    const [bRow] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentB));
    expect(aRow.memberId).toBe(m2);
    expect(bRow.memberId).toBe(m1);

    const changes = await db
      .select()
      .from(assignmentChange)
      .where(eq(assignmentChange.swapGroupId, swapGroupId));
    expect(changes).toHaveLength(2);
    expect(new Set(changes.map((c) => c.swapGroupId)).size).toBe(1);
  });

  it('swap rolls back atomically when one assignment does not exist', async () => {
    const [beforeA] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentA));
    const beforeChanges = await db.select().from(assignmentChange);

    await expect(
      service.swap(assignmentA, randomUUID(), {
        actorMemberId: m1,
        source: 'system',
        canAssignAny: true,
      }),
    ).rejects.toThrow();

    const [afterA] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentA));
    expect(afterA.memberId).toBe(beforeA.memberId);

    const afterChanges = await db.select().from(assignmentChange);
    expect(afterChanges.length).toBe(beforeChanges.length);
  });

  it('undo in-window reverses a reassign', async () => {
    const before = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentA))
      .then(([r]) => r);

    const { changeId } = await service.reassign(assignmentA, m3, {
      actorMemberId: before.memberId,
      source: 'system',
      canAssignAny: true,
    });

    const result = await service.undo(`change:${changeId}`, m2);
    expect(result.ok).toBe(true);

    const [aRow] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentA));
    expect(aRow.memberId).toBe(before.memberId);

    const [changeRow] = await db
      .select()
      .from(assignmentChange)
      .where(eq(assignmentChange.id, changeId));
    expect(changeRow.undoneAt).not.toBeNull();
  });

  it('undo out-of-window throws undo_window_expired', async () => {
    const [original] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 1));
    await db
      .update(appSettings)
      .set({ undoWindowMinutes: 0 })
      .where(eq(appSettings.id, 1));

    try {
      const { changeId } = await service.reassign(assignmentB, m3, {
        actorMemberId: m2,
        source: 'system',
        canAssignAny: true,
      });
      await expect(service.undo(`change:${changeId}`, m2)).rejects.toThrow();
    } finally {
      await db
        .update(appSettings)
        .set({ undoWindowMinutes: original.undoWindowMinutes })
        .where(eq(appSettings.id, 1));
    }
  });

  it('undo of an already-undone change throws already_undone', async () => {
    const { changeId } = await service.reassign(assignmentA, m1, {
      actorMemberId: m2,
      source: 'system',
      canAssignAny: true,
    });

    await service.undo(`change:${changeId}`, m2);
    await expect(service.undo(`change:${changeId}`, m2)).rejects.toThrow();
  });

  it('chained substitute undo restores the original presenter and originalMemberId', async () => {
    await db
      .update(assignment)
      .set({ memberId: m1, originalMemberId: null, status: 'planned' })
      .where(eq(assignment.id, assignmentA));

    const sub1 = await service.substitute(assignmentA, m2, {
      actorMemberId: null,
      source: 'system',
      canAssignAny: true,
    });
    const sub2 = await service.substitute(assignmentA, m3, {
      actorMemberId: null,
      source: 'system',
      canAssignAny: true,
    });

    await service.undo(`change:${sub2.changeId}`, m1);
    let [row] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentA));
    expect(row.memberId).toBe(m2);
    expect(row.originalMemberId).toBe(m1);

    await service.undo(`change:${sub1.changeId}`, m1);
    [row] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentA));
    expect(row.memberId).toBe(m1);
    expect(row.originalMemberId).toBeNull();
  });

  it('undo of a non-latest change is rejected as stale_undo', async () => {
    await db
      .update(assignment)
      .set({ memberId: m1, originalMemberId: null, status: 'planned' })
      .where(eq(assignment.id, assignmentA));

    const first = await service.reassign(assignmentA, m2, {
      actorMemberId: null,
      source: 'system',
      canAssignAny: true,
    });
    await service.reassign(assignmentA, m3, {
      actorMemberId: null,
      source: 'system',
      canAssignAny: true,
    });

    await expectRejectionCode(
      service.undo(`change:${first.changeId}`, m1),
      'stale_undo',
    );
  });

  it('undo swap via change:<id> undoes both linked change rows', async () => {
    await db
      .update(assignment)
      .set({ memberId: m1, originalMemberId: null, status: 'planned' })
      .where(eq(assignment.id, assignmentA));
    await db
      .update(assignment)
      .set({ memberId: m2, originalMemberId: null, status: 'planned' })
      .where(eq(assignment.id, assignmentB));

    const { swapGroupId } = await service.swap(assignmentA, assignmentB, {
      actorMemberId: m1,
      source: 'system',
      canAssignAny: true,
    });

    const swapRows = await db
      .select()
      .from(assignmentChange)
      .where(eq(assignmentChange.swapGroupId, swapGroupId));
    const oneChangeId = swapRows[0].id;

    await service.undo(`change:${oneChangeId}`, m1);

    const [aRow] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentA));
    const [bRow] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentB));
    expect(aRow.memberId).toBe(m1);
    expect(bRow.memberId).toBe(m2);

    const afterRows = await db
      .select()
      .from(assignmentChange)
      .where(eq(assignmentChange.swapGroupId, swapGroupId));
    expect(afterRows.every((r) => r.undoneAt !== null)).toBe(true);
  });

  it('reassign clears needs_substitute status and originalMemberId', async () => {
    await db
      .update(assignment)
      .set({ memberId: m1, originalMemberId: null, status: 'planned' })
      .where(eq(assignment.id, assignmentA));

    await service.markUnavailable(assignmentA, {
      actorMemberId: null,
      source: 'system',
      canAssignAny: true,
    });
    let [row] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentA));
    expect(row.status).toBe('needs_substitute');

    await service.reassign(assignmentA, m2, {
      actorMemberId: null,
      source: 'system',
      canAssignAny: true,
    });
    [row] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentA));
    expect(row.status).toBe('planned');
    expect(row.originalMemberId).toBeNull();
    expect(row.memberId).toBe(m2);
  });

  it('rejects a self-swap and a swap of two slots with the same presenter', async () => {
    await expectRejectionCode(
      service.swap(assignmentA, assignmentA, {
        actorMemberId: m1,
        source: 'system',
        canAssignAny: true,
      }),
      'invalid_swap',
    );

    await db
      .update(assignment)
      .set({ memberId: m3, originalMemberId: null, status: 'planned' })
      .where(eq(assignment.id, assignmentA));
    await db
      .update(assignment)
      .set({ memberId: m3, originalMemberId: null, status: 'planned' })
      .where(eq(assignment.id, assignmentB));

    await expectRejectionCode(
      service.swap(assignmentA, assignmentB, {
        actorMemberId: m1,
        source: 'system',
        canAssignAny: true,
      }),
      'nothing_to_swap',
    );
  });
});
