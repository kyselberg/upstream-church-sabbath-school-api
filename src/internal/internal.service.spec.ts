import { TOKEN_TTL_MS } from '../members/members.service';
// ponytail: tests the extracted predicate directly instead of a DB-backed
// linkTelegram integration test, to avoid writing test rows into the live DB.
import { isAlreadyLinked } from './internal.service';

describe('isAlreadyLinked', () => {
  it('is true when the member already has a telegramUserId', () => {
    expect(isAlreadyLinked(123)).toBe(true);
  });

  it('is false when the member has no telegramUserId yet', () => {
    expect(isAlreadyLinked(null)).toBe(false);
  });
});

describe('onboarding token TTL', () => {
  it('is 15 minutes', () => {
    expect(TOKEN_TTL_MS).toBe(15 * 60 * 1000);
  });
});
