import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db/db.module';
import { assignment, klass, quarter } from '../db/schema';
import { QuartersService } from './quarters.service';

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

describe('QuartersService.create (integration)', () => {
  const service = new QuartersService(db);

  it('rejects an oversized date range', async () => {
    await expectRejectionCode(
      service.create({
        name: '__test_huge_quarter',
        startDate: '1900-01-01',
        endDate: '2900-01-01',
      }),
      'invalid_quarter_range',
    );
  });

  it('rejects an endDate not after startDate', async () => {
    await expectRejectionCode(
      service.create({
        name: '__test_inverted_quarter',
        startDate: '2026-06-01',
        endDate: '2026-01-01',
      }),
      'invalid_quarter_range',
    );
  });
});

describe('QuartersService.remove (integration)', () => {
  const service = new QuartersService(db);
  const quarterIds: string[] = [];
  const classIds: string[] = [];

  afterAll(async () => {
    for (const id of quarterIds) {
      await db.delete(assignment).where(eq(assignment.quarterId, id));
      await db.delete(quarter).where(eq(quarter.id, id));
    }
    for (const id of classIds) {
      await db.delete(klass).where(eq(klass.id, id));
    }
  });

  it('rejects deleting a quarter that has an assignment', async () => {
    const [q] = await db
      .insert(quarter)
      .values({
        name: '__test_quarter_with_assignment',
        startDate: '2026-01-01',
        endDate: '2026-03-01',
      })
      .returning();
    quarterIds.push(q.id);

    const [c] = await db
      .insert(klass)
      .values({ name: '__test_class_for_quarter_delete' })
      .returning();
    classIds.push(c.id);

    await db.insert(assignment).values({
      classId: c.id,
      date: '2026-01-03',
      quarterId: q.id,
    });

    await expectRejectionCode(
      service.remove(q.id),
      'quarter_has_assignments',
    );
  });
});
