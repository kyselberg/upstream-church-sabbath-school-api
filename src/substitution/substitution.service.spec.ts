import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db/db.module';
import { assignment, klass, member } from '../db/schema';
import {
  formatGroupText,
  isOwner,
  isResponder,
  membersBusyOnDate,
  SubstitutionService,
} from './substitution.service';

describe('isOwner', () => {
  it('is true when the assignment belongs to the actor', () => {
    expect(isOwner({ memberId: 'm1' }, 'm1')).toBe(true);
  });

  it('is false for a different member', () => {
    expect(isOwner({ memberId: 'm1' }, 'm2')).toBe(false);
  });

  it('doubles as the respond() holder-changed guard (assignment reassigned since the request was sent)', () => {
    expect(isOwner({ memberId: 'newHolder' }, 'originalRequester')).toBe(
      false,
    );
  });
});

describe('isResponder', () => {
  it('is true when the responding member matches the request candidate', () => {
    expect(isResponder({ toMemberId: 'candidate1' }, 'candidate1')).toBe(true);
  });

  it('is false when a different member tries to answer the request (not_your_request gate)', () => {
    expect(isResponder({ toMemberId: 'candidate1' }, 'someoneElse')).toBe(
      false,
    );
  });
});

describe('membersBusyOnDate', () => {
  it('returns the members with a non-cancelled assignment on that date', async () => {
    const fakeDb = {
      selectDistinct: () => ({
        from: () => ({
          where: () => Promise.resolve([{ memberId: 'm1' }, { memberId: 'm2' }]),
        }),
      }),
    };
    const busy = await membersBusyOnDate(
      fakeDb as any,
      '2026-07-19',
      ['m1', 'm2', 'm3'],
    );
    expect(busy).toEqual(new Set(['m1', 'm2']));
  });

  it('returns an empty set without querying when memberIds is empty', async () => {
    const dbThatThrows = {
      selectDistinct: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      membersBusyOnDate(dbThatThrows as any, '2026-07-19', []),
    ).resolves.toEqual(new Set());
  });
});

describe('candidates() against a live DB', () => {
  it('returns an active telegram-linked member who is NOT in the class teacher pool', async () => {
    const service = new SubstitutionService(db, {} as any);
    const tag = Date.now();
    const [cls] = await db
      .insert(klass)
      .values({ name: `spec-class-${tag}` })
      .returning({ id: klass.id });
    const [requester] = await db
      .insert(member)
      .values({
        fullName: `spec-requester-${tag}`,
        telegramUserId: tag,
        isActive: true,
      })
      .returning({ id: member.id });
    const [nonPoolCandidate] = await db
      .insert(member)
      .values({
        fullName: `spec-nonpool-${tag}`,
        telegramUserId: tag + 1,
        isActive: true,
      })
      .returning({ id: member.id });
    const [a] = await db
      .insert(assignment)
      .values({
        classId: cls.id,
        date: '2099-01-01',
        memberId: requester.id,
      })
      .returning({ id: assignment.id });

    try {
      const result = await service.candidates(a.id, requester.id);
      expect(
        (result as { candidates: { memberId: string }[] }).candidates.map(
          (c) => c.memberId,
        ),
      ).toContain(nonPoolCandidate.id);
    } finally {
      await db.delete(assignment).where(eq(assignment.id, a.id));
      await db
        .delete(member)
        .where(eq(member.id, requester.id));
      await db
        .delete(member)
        .where(eq(member.id, nonPoolCandidate.id));
      await db.delete(klass).where(eq(klass.id, cls.id));
    }
  }, 20000);
});

describe('formatGroupText', () => {
  it('formats the group announcement', () => {
    expect(formatGroupText('Іван', 'Марія', 'Молодша', '2026-07-19')).toBe(
      '🔄 Заміна: Іван замінює Марія — Молодша, 2026-07-19',
    );
  });
});
