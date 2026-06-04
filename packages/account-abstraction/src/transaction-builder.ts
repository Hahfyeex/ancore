import {
  Contract,
  nativeToScVal,
  Transaction,
  TransactionBuilder as StellarTransactionBuilder,
  xdr,
  ScInt,
} from '@stellar/stellar-sdk';
import { NotImplementedError } from './errors';

export type TransactionBuilderOptions = {
  fee?: string;
  networkPassphrase?: string;
  timeoutSeconds?: number;
  sorobanData?: SorobanData;
};

export interface ContractExecuteParams {
  contractId: string;
  method: string;
  args: unknown[];
}

type BuilderOp =
  | {
      type: 'sessionKey';
      op: 'add' | 'revoke';
      sessionKey: string;
      permissions: number[];
      expiresAt: number;
    }
  | ({ type: 'contractExecute' } & ContractExecuteParams)
  | { type: 'custom'; operation: xdr.Operation };

export interface SimulationResult {
  fee: string;
  operationCount: number;
  minResourceFee?: string;
  transactionData?: SorobanData;
}

export class TransactionBuilder {
  private readonly source: string;
  private readonly accountContractId: string;
  private readonly ops: BuilderOp[] = [];
  private fee: string;
  private readonly networkPassphrase: string;
  private readonly timeoutSeconds: number;
  private sorobanData?: SorobanData;
  private simulatedFee?: string;
 

  constructor(source: string, accountContractId: string, options: TransactionBuilderOptions = {}) {
    if (!source || typeof source !== 'string') {
      throw new TypeError('TransactionBuilder requires a source account ID.');
    }

    if (!accountContractId || typeof accountContractId !== 'string') {
      throw new TypeError('TransactionBuilder requires an account abstraction contract ID.');
    }

    this.source = source;
    this.accountContractId = accountContractId;
    this.fee = options.fee ?? '10000';
    this.networkPassphrase =
      options.networkPassphrase ?? 'Test SDF Future Network ; September 2021';
    this.timeoutSeconds = options.timeoutSeconds ?? 180;
    this.sorobanData = options.sorobanData;
  }

  /**
   * Add a session key to the smart account.
   * @param publicKey - The session key public key (64-char hex string)
   * @param permissions - Array of permission bitmasks
   * @param expiresAt - Unix timestamp when the key expires
   */
  addSessionKey(publicKey: string, permissions: number[], expiresAt: number): this {
    this.assertSessionKeyParams(publicKey, permissions, expiresAt);
    this.ops.push({
      type: 'sessionKey',
      op: 'add',
      sessionKey: publicKey,
      permissions,
      expiresAt,
    });
    return this;
  }

  /**
   * Revoke a session key from the smart account.
   * @param publicKey - The session key public key to revoke (64-char hex string)
   */
  revokeSessionKey(publicKey: string): this {
    if (!publicKey || typeof publicKey !== 'string') {
      throw new TypeError('revokeSessionKey requires a non-empty publicKey string.');
    }

    this.ops.push({
      type: 'sessionKey',
      op: 'revoke',
      sessionKey: publicKey,
      permissions: [],
      expiresAt: 0,
    });
    return this;
  }

  /**
   * Execute a contract call using a session key.
   * @param sessionKey - The session key public key to sign with
   * @param operations - Array of contract execution parameters
   */
  execute(sessionKey: string, operations: ContractExecuteParams[]): this {
    if (!sessionKey || typeof sessionKey !== 'string') {
      throw new TypeError('execute requires a non-empty sessionKey string.');
    }
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new TypeError('execute requires at least one operation.');
    }

    operations.forEach((op) => {
      this.ops.push({ type: 'contractExecute', ...op });
    });

    return this;
  }

  /**
   * Add a custom Stellar operation to the transaction.
   * @param operation - A raw xdr.Operation
   */
  addOperation(operation: xdr.Operation): this {
    this.ops.push({ type: 'custom', operation });
    return this;
  }

  /**
   * Simulate the transaction to estimate fees.
   * In a real implementation, this would call the Soroban RPC simulate method.
   * For MVP, returns estimated values based on operation count.
   */
  async simulate(): Promise<SimulationResult> {
    // In production, this would call:
    // const server = new Server(rpcUrl);
    // const result = await server.simulateTransaction(tx);
    
    const operationCount = this.ops.length;
    const baseFee = parseInt(this.fee);
    const estimatedFee = (baseFee * operationCount).toString();
    
    // Estimate resource fee (100 stroops per operation as a heuristic)
    const resourceFee = (operationCount * 100).toString();
    
    this.simulatedFee = estimatedFee;
    this.simulatedResourceFee = resourceFee;

    return {
      fee: estimatedFee,
      operationCount,
      minResourceFee: resourceFee,
      transactionData: this.sorobanData,
    };
  }

  /**
   * Build the final transaction ready for signing.
   * Must call simulate() first to get accurate fee estimates.
   */
build(): Transaction {
  if (!this.simulatedFee) {
    throw new Error('Must call simulate() before build() to get accurate fee estimates');
  }

  const stellarBuilder = new StellarTransactionBuilder(this.source, {
    fee: this.simulatedFee,
    networkPassphrase: this.networkPassphrase,
  });

  // Add all operations
  this.ops.forEach((op) => {
    stellarBuilder.addOperation(this.buildOperation(op));
  });

  // Set timeout
  stellarBuilder.setTimeout(this.timeoutSeconds);

  // Set Soroban data if available
  if (this.sorobanData) {
    stellarBuilder.setSorobanData(this.sorobanData);
  }

  return stellarBuilder.build();
}

 private buildOperation(op: BuilderOp): xdr.Operation {
  if (op.type === 'contractExecute') {
    const contract = new Contract(op.contractId);
    const args = op.args.map((value) => nativeToScVal(value));
    return contract.call(op.method, ...args).toXDR();
  }

  if (op.type === 'custom') {
    return op.operation;
  }

  const contract = new Contract(this.accountContractId);
  if (op.op === 'add') {
    return contract.call(
      'add_session_key',
      nativeToScVal(op.sessionKey),
      nativeToScVal(new ScInt(op.expiresAt)),
      nativeToScVal(op.permissions)
    ).toXDR();
  }

  return contract.call('revoke_session_key', nativeToScVal(op.sessionKey)).toXDR();
}
  private assertSessionKeyParams(
    sessionKey: string,
    permissions: number[],
    expiresAt: number
  ): void {
    if (!sessionKey || typeof sessionKey !== 'string') {
      throw new TypeError('Session key must be a non-empty string.');
    }
    if (!/^[0-9a-fA-F]{64}$/.test(sessionKey)) {
      throw new TypeError('Session key must be a 64-character hex string.');
    }
    if (!Array.isArray(permissions)) {
      throw new TypeError('Session key permissions must be an array.');
    }
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      throw new TypeError('Session key expiresAt must be a finite number.');
    }
  }
}
