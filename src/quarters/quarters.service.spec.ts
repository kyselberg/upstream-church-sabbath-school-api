import 'dotenv/config';
import { db } from '../db/db.module';
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
