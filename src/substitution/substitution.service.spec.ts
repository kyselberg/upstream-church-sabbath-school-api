import { formatGroupText, isOwner, isResponder } from './substitution.service';

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

describe('formatGroupText', () => {
  it('formats the group announcement', () => {
    expect(formatGroupText('Іван', 'Марія', 'Молодша', '2026-07-19')).toBe(
      '🔄 Заміна: Іван замінює Марія — Молодша, 2026-07-19',
    );
  });
});
