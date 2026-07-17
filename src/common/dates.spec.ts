import { isSaturday, saturdaysBetween } from './dates';

describe('isSaturday', () => {
  it('true for a known Saturday', () => {
    expect(isSaturday('2026-07-04')).toBe(true);
  });

  it('false for a known non-Saturday', () => {
    expect(isSaturday('2026-07-05')).toBe(false);
  });
});

describe('saturdaysBetween', () => {
  function expectAllSaturdays(dates: string[]) {
    for (const d of dates) {
      expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(6);
    }
  }

  it('crosses the Europe/Kyiv spring DST switch (2026-03-01..2026-04-30)', () => {
    const result = saturdaysBetween('2026-03-01', '2026-04-30');
    expectAllSaturdays(result);
    expect(result.length).toBe(8);
  });

  it('crosses the Europe/Kyiv autumn DST switch (2026-10-01..2026-11-15)', () => {
    const result = saturdaysBetween('2026-10-01', '2026-11-15');
    expectAllSaturdays(result);
    expect(result.length).toBe(7);
  });

  it('matches the known 2026 Q3 quarter (2026-07-04..2026-09-26 -> 13 Saturdays)', () => {
    const result = saturdaysBetween('2026-07-04', '2026-09-26');
    expectAllSaturdays(result);
    expect(result).toEqual([
      '2026-07-04',
      '2026-07-11',
      '2026-07-18',
      '2026-07-25',
      '2026-08-01',
      '2026-08-08',
      '2026-08-15',
      '2026-08-22',
      '2026-08-29',
      '2026-09-05',
      '2026-09-12',
      '2026-09-19',
      '2026-09-26',
    ]);
  });

  it('is inclusive of start/end when both are Saturdays', () => {
    const result = saturdaysBetween('2026-07-04', '2026-07-04');
    expect(result).toEqual(['2026-07-04']);
  });
});
