import { webcrypto } from 'node:crypto';

/** Force Node webcrypto — jsdom's subtle is incomplete on some Linux CI runners. */
export function ensureWebCrypto(): void {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

ensureWebCrypto();
