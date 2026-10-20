import { getSessionKeyRemainingTimeMs } from '../src/session-keys';

describe('getSessionKeyRemainingTimeMs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns zero for an expired timestamp', () => {
    jest.spyOn(Date, 'now').mockReturnValue(2_000_000_000_000);
    expect(getSessionKeyRemainingTimeMs({ expiresAt: 1_999_999_999 })).toBe(0);
  });

  it('returns zero when the timestamp is the current time', () => {
    jest.spyOn(Date, 'now').mockReturnValue(2_000_000_000_000);
    expect(getSessionKeyRemainingTimeMs({ expiresAt: 2_000_000_000 })).toBe(0);
  });

  it('returns the remaining milliseconds for a future seconds timestamp', () => {
    jest.spyOn(Date, 'now').mockReturnValue(2_000_000_000_000);
    expect(getSessionKeyRemainingTimeMs({ expiresAt: 2_000_000_005 })).toBe(5_000);
  });

  it('accepts timestamps already expressed in milliseconds', () => {
    jest.spyOn(Date, 'now').mockReturnValue(2_000_000_000_000);
    expect(getSessionKeyRemainingTimeMs({ expiresAt: 2_000_000_005_000 })).toBe(5_000);
  });

  it('returns zero for a non-finite timestamp', () => {
    expect(getSessionKeyRemainingTimeMs({ expiresAt: Number.NaN })).toBe(0);
  });
});
