import { toHex, fromHex, toBase64, fromBase64 } from '../encoding';
import { sha256, sha512, hmac } from '../hashing';

describe('encoding utilities', () => {
  it('round-trips hex and base64', () => {
    const bytes = Uint8Array.from([1, 2, 3, 254, 255]);
    const hex = toHex(bytes);
    const b64 = toBase64(bytes);

    expect(fromHex(hex)).toEqual(bytes);
    expect(fromBase64(b64)).toEqual(bytes);
  });

  it('rejects invalid hex and invalid base64', () => {
    expect(() => fromHex('abc')).toThrow(TypeError);
    expect(() => fromHex('zz')).toThrow(TypeError);
    expect(() => fromBase64('@@@')).toThrow(TypeError);
  });
});

describe('hashing utilities', () => {
  it('produces deterministic output lengths for strings and bytes', () => {
    expect(sha256('hello')).toHaveLength(32);
    expect(sha512('hello')).toHaveLength(64);
    expect(hmac('key', 'message')).toHaveLength(32);

    const bytes = Uint8Array.from([1, 2, 3]);
    expect(sha256(bytes)).toHaveLength(32);
    expect(sha512(bytes)).toHaveLength(64);
  });
});
