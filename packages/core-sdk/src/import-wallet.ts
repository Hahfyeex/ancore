/**
 * importWallet — parse a BIP39 mnemonic, derive a Stellar keypair, encrypt
 * the secret key with the provided password, and return the same wallet shape
 * as createWallet().
 *
 * Flow:
 *  1. Validate the BIP39 mnemonic via @ancore/crypto
 *  2. Derive a Stellar keypair from the mnemonic seed (BIP39 → seed → Ed25519)
 *  3. Encrypt the secret key using @ancore/crypto encryptSecretKey
 *  4. Return a typed ImportedWallet result
 */

import { Keypair } from '@stellar/stellar-sdk';
import { validateMnemonic } from '@ancore/crypto';
import type { EncryptedSecretKeyPayload } from '@ancore/crypto';

import { BuilderValidationError, AncoreSdkError } from './errors';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The wallet shape returned by both createWallet and importWallet. */
export interface ImportedWallet {
  /** Stellar public key (G…). */
  publicKey: string;
  /** Encrypted secret key payload — store this, never the raw secret. */
  encryptedSecretKey: EncryptedSecretKeyPayload;
}

/**
 * Signer interface for the encryption step.
 * Injected so callers can swap in @ancore/crypto's encryptSecretKey or a mock.
 */
export interface WalletEncryptor {
  encryptSecretKey(secretKey: string, password: string): Promise<EncryptedSecretKeyPayload>;
}

/**
 * Mnemonic-to-seed deriver interface.
 * Injected so callers can swap in bip39.mnemonicToSeedSync or a mock.
 */
export interface MnemonicDeriver {
  mnemonicToSeed(mnemonic: string, passphrase?: string): Promise<Buffer> | Buffer;
}

export interface ImportWalletParams {
  /** BIP39 mnemonic phrase (12 or 24 words). */
  mnemonic: string;
  /** Password used to encrypt the derived secret key. */
  password: string;
  /**
   * Optional BIP39 passphrase (25th word).
   * Defaults to empty string for standard derivation.
   */
  bip39Passphrase?: string;
}

export interface ImportWalletDeps {
  /** Provides mnemonicToSeed — inject bip39 or a mock. */
  deriver: MnemonicDeriver;
  /** Provides encryptSecretKey — inject @ancore/crypto or a mock. */
  encryptor: WalletEncryptor;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Import a wallet from a BIP39 mnemonic phrase.
 *
 * @param params - mnemonic, password, optional bip39Passphrase
 * @param deps   - injected deriver + encryptor (enables unit testing without crypto)
 * @returns      ImportedWallet with publicKey + encryptedSecretKey
 *
 * @throws {BuilderValidationError} on invalid mnemonic or password
 * @throws {AncoreSdkError}         on derivation or encryption failure
 */
export async function importWallet(
  params: ImportWalletParams,
  deps: ImportWalletDeps
): Promise<ImportedWallet> {
  validateImportWalletParams(params);

  // 1. Derive seed from mnemonic
  let seed: Buffer;
  try {
    seed = Buffer.from(
      await deps.deriver.mnemonicToSeed(params.mnemonic, params.bip39Passphrase ?? '')
    );
  } catch (err) {
    throw new BuilderValidationError(
      `Failed to derive seed from mnemonic: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 2. Derive Stellar keypair from first 32 bytes of seed (Ed25519 raw seed)
  let keypair: Keypair;
  try {
    keypair = Keypair.fromRawEd25519Seed(seed.slice(0, 32));
  } catch (err) {
    throw new BuilderValidationError(
      `Failed to derive Stellar keypair: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 3. Encrypt the secret key
  let encryptedSecretKey: EncryptedSecretKeyPayload;
  try {
    encryptedSecretKey = await deps.encryptor.encryptSecretKey(keypair.secret(), params.password);
  } catch (err) {
    if (err instanceof AncoreSdkError) throw err;
    throw new BuilderValidationError(
      `Failed to encrypt secret key: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    publicKey: keypair.publicKey(),
    encryptedSecretKey,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateImportWalletParams(params: ImportWalletParams): void {
  if (!params || typeof params !== 'object') {
    throw new BuilderValidationError('importWallet requires a params object.');
  }
  if (typeof params.mnemonic !== 'string' || params.mnemonic.trim().length === 0) {
    throw new BuilderValidationError('importWallet: "mnemonic" must be a non-empty string.');
  }
  if (!validateMnemonic(params.mnemonic.trim())) {
    throw new BuilderValidationError(
      'importWallet: invalid BIP39 mnemonic. Ensure all words are valid and the checksum is correct.'
    );
  }
  if (typeof params.password !== 'string' || params.password.length === 0) {
    throw new BuilderValidationError('importWallet: "password" must be a non-empty string.');
  }
}
