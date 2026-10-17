import { validateTransferPolicy, type TransferPolicy } from '@ancore/types';
import type { RelayError } from '../types';
import { RelayErrorCodes } from '../types';

export interface TransferValidationContext {
  amount: number;
  todayTotal: number;
  policy: TransferPolicy;
  /** Asset code shown in policy denial messages. Defaults to XLM. */
  assetCode?: string;
  /**
   * True only after the caller has completed the extra confirmation the
   * step-up tier requires. Absent or false leaves the transfer blocked.
   */
  stepUpConfirmed?: boolean;
}

export interface TransferValidationResult {
  valid: boolean;
  error?: RelayError;
  requiresStepUp?: boolean;
}

/**
 * Validates a relay request against transfer policy constraints.
 * Checks daily limit and step-up threshold requirements.
 */
export function validateTransferPolicyConstraints(
  context: TransferValidationContext
): TransferValidationResult {
  const result = validateTransferPolicy(
    context.amount,
    context.todayTotal,
    context.policy,
    context.assetCode
  );

  if (result.action === 'block') {
    return {
      valid: false,
      error: {
        code: RelayErrorCodes.POLICY_DENIED,
        message: result.message,
      },
    };
  }

  if (result.action === 'step_up') {
    if (context.stepUpConfirmed === true) {
      return { valid: true };
    }
    return {
      valid: false,
      requiresStepUp: true,
      error: {
        code: RelayErrorCodes.POLICY_DENIED,
        message: result.message,
      },
    };
  }

  return { valid: true };
}
