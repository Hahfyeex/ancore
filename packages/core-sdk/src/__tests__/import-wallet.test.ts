/**
 * Unit tests for importWallet — mocked deriver + encryptor.
 * Verifies deterministic key derivation and encryption orchestration.
 */

import { importWallet, type ImportWalletParams, type ImportWalletDeps } from '../import-wallet';
import { BuilderValidationError } from '../errors';

// ---------------------------------------------------------------------------
// Mock @ancore/crypto validateMnemonic
// ---------------------------------------------------------------------------

jest.mock('@ancore/crypto', () => ({
  validateMnemonic: jest.fn((m: string) => VALID_MNEMONICS.has(m.trim())),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// A real BIP39 12-word mnemonic (test-only, never use in production)
const VALID_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const VALID_MNEMONICS = new Set([VALID_MNEMONIC]);

// Deterministic 64-byte seed for the above mnemonic (first 32 bytes used)
const MOCK_SEED = Buffer.alloc(64, 0x01);

const MOCK_ENCRYPTED = {
  version: 1,
  iterations: 100000,
  salt: 'c2FsdA==',
  iv: 'aXY=',
  ciphertext: 'Y2lwaGVydGV4dA==',
};

function makeDeps(overrides?: Partial<ImportWalletDeps>): ImportWalletDeps {
  return {
    deriver: {
      mnemonicToSeed: jest.fn().mockResolvedValue(MOCK_SEED),
    },
    encryptor: {
      encryptSecretKey: jest.fn().mockResolvedValue(MOCK_ENCRYPTED),
    },
    ...overrides,
  };
}

function makeParams(overrides?: Partial<ImportWalletParams>): ImportWalletParams {
  return {
    mnemonic: VALID_MNEMONIC,
    password: 'hunter2',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('importWallet', () => {
  describe('happy path', () => {
    it('returns publicKey and encryptedSecretKey', async () => {
      const deps = makeDeps();
      const result = await importWallet(makeParams(), deps);

      expect(result.publicKey).toBeDefined();
      expect(result.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(result.encryptedSecretKey).toBe(MOCK_ENCRYPTED);
    });

    it('calls deriver.mnemonicToSeed with the mnemonic and empty passphrase by default', async () => {
      const deps = makeDeps();
      await importWallet(makeParams(), deps);

      expect(deps.deriver.mnemonicToSeed).toHaveBeenCalledWith(VALID_MNEMONIC, '');
    });

    it('passes bip39Passphrase to deriver when provided', async () => {
      const deps = makeDeps();
      await importWallet(makeParams({ bip39Passphrase: 'extra' }), deps);

      expect(deps.deriver.mnemonicToSeed).toHaveBeenCalledWith(VALID_MNEMONIC, 'extra');
    });

    it('calls encryptor.encryptSecretKey with the derived secret and password', async () => {
      const deps = makeDeps();
      await importWallet(makeParams({ password: 'mypassword' }), deps);

      expect(deps.encryptor.encryptSecretKey).toHaveBeenCalledWith(
        expect.any(String), // the derived secret key (S…)
        'mypassword'
      );
    });

    it('is deterministic — same mnemonic + seed produces same publicKey', async () => {
      const deps1 = makeDeps();
      const deps2 = makeDeps();

      const r1 = await importWallet(makeParams(), deps1);
      const r2 = await importWallet(makeParams(), deps2);

      expect(r1.publicKey).toBe(r2.publicKey);
    });

    it('uses only the first 32 bytes of the seed for keypair derivation', async () => {
      // Seed with distinct first 32 bytes vs last 32 bytes
      const seedA = Buffer.concat([Buffer.alloc(32, 0xaa), Buffer.alloc(32, 0xbb)]);
      const seedB = Buffer.concat([Buffer.alloc(32, 0xaa), Buffer.alloc(32, 0xcc)]);

      const depsA = makeDeps({ deriver: { mnemonicToSeed: jest.fn().mockResolvedValue(seedA) } });
      const depsB = makeDeps({ deriver: { mnemonicToSeed: jest.fn().mockResolvedValue(seedB) } });

      const rA = await importWallet(makeParams(), depsA);
      const rB = await importWallet(makeParams(), depsB);

      // Same first 32 bytes → same keypair
      expect(rA.publicKey).toBe(rB.publicKey);
    });
  });

  describe('validation errors', () => {
    it('throws BuilderValidationError for empty mnemonic', async () => {
      await expect(importWallet(makeParams({ mnemonic: '' }), makeDeps())).rejects.toThrow(
        BuilderValidationError
      );
    });

    it('throws BuilderValidationError for invalid mnemonic', async () => {
      await expect(
        importWallet(makeParams({ mnemonic: 'not a valid mnemonic phrase at all' }), makeDeps())
      ).rejects.toThrow(BuilderValidationError);
    });

    it('throws BuilderValidationError for empty password', async () => {
      await expect(importWallet(makeParams({ password: '' }), makeDeps())).rejects.toThrow(
        BuilderValidationError
      );
    });

    it('throws BuilderValidationError for missing params', async () => {
      await expect(importWallet(null as any, makeDeps())).rejects.toThrow(BuilderValidationError);
    });
  });

  describe('error mapping', () => {
    it('wraps deriver errors as BuilderValidationError', async () => {
      const deps = makeDeps({
        deriver: {
          mnemonicToSeed: jest.fn().mockRejectedValue(new Error('seed derivation failed')),
        },
      });

      await expect(importWallet(makeParams(), deps)).rejects.toThrow(BuilderValidationError);
      await expect(importWallet(makeParams(), deps)).rejects.toThrow('seed derivation failed');
    });

    it('wraps encryptor errors as BuilderValidationError', async () => {
      const deps = makeDeps({
        encryptor: {
          encryptSecretKey: jest.fn().mockRejectedValue(new Error('encryption failed')),
        },
      });

      await expect(importWallet(makeParams(), deps)).rejects.toThrow(BuilderValidationError);
      await expect(importWallet(makeParams(), deps)).rejects.toThrow('encryption failed');
    });
  });
});
