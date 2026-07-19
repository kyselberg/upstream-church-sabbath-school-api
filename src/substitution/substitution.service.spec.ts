import {
  formatGroupText,
  isCandidateInPool,
  isOwner,
  isResponder,
  membersBusyOnDate,
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

describe('isCandidateInPool', () => {
  it('is true when the pool query found the candidate still active in the class', () => {
    expect(isCandidateInPool({ memberId: 'm1' })).toBe(true);
  });

  it('is false when the candidate was removed from the class pool since request() (candidate_unavailable gate)', () => {
    expect(isCandidateInPool(undefined)).toBe(false);
  });
});

describe('formatGroupText', () => {
  it('formats the group announcement', () => {
    expect(formatGroupText('Іван', 'Марія', 'Молодша', '2026-07-19')).toBe(
      '🔄 Заміна: Іван замінює Марія — Молодша, 2026-07-19',
    );
  });
});
