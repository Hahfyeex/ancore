import { ScheduledTransferStore } from '../ScheduledTransferStore';
import { ScheduledTransferService } from '../ScheduledTransferService';
import { RelayService } from '../../services/relayService';
import { MemoryNonceStore } from '../../store/nonceStore';

const VALID_KEY = 'a'.repeat(64);
const VALID_SIG = 'b'.repeat(128);
const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const RECIPIENT = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

function validBody(startAt: string) {
  return {
    accountAddress: ACCOUNT,
    to: RECIPIENT,
    amount: '10.5',
    asset: 'XLM',
    frequency: 'daily' as const,
    startAt,
    userApproved: true as const,
    relayPayload: {
      sessionKey: VALID_KEY,
      operation: 'relay_execute' as const,
      parameters: { to: RECIPIENT, amount: '10.5' },
      signature: VALID_SIG,
      nonce: 1,
    },
  };
}

describe('ScheduledTransferService execution safeguards', () => {
  it('does not execute the same transfer concurrently', async () => {
    const store = new ScheduledTransferStore();
    const relayService = new RelayService({ verify: () => true });
    const service = new ScheduledTransferService(store, relayService);

    const transfer = await service.create(validBody(new Date().toISOString()), 'caller-a');
    expect(store.tryAcquireProcessing(transfer.id)).toBe(true);
    expect(store.tryAcquireProcessing(transfer.id)).toBe(false);
    store.releaseProcessing(transfer.id);
  });

  it('backs off recurring failures instead of hot-looping', async () => {
    const store = new ScheduledTransferStore();
    const relayService = {
      executeRelay: jest.fn().mockResolvedValue({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'bad sig' },
        gasUsed: 0,
      }),
    };
    const service = new ScheduledTransferService(store, relayService as never);
    const transfer = await service.create(validBody(new Date().toISOString()), 'caller-a');

    const beforeProcess = Date.now();
    await service.processDueTransfers(new Date());

    const updated = store.getById(transfer.id);
    expect(updated?.consecutiveFailures).toBe(1);
    expect(new Date(updated!.nextRunAt).getTime()).toBeGreaterThanOrEqual(beforeProcess);
    expect(await service.listExecutions(transfer.id, 'caller-a')).toHaveLength(1);
  });

  it('uses a fresh nonce on each recurring execution', async () => {
    const store = new ScheduledTransferStore();
    const nonceStore = new MemoryNonceStore();
    const approvedNonce = 1;
    const relayService = new RelayService(
      {
        verify: (_key: string, payload: string) => {
          const parsed = JSON.parse(Buffer.from(payload, 'hex').toString('utf8')) as {
            nonce: number;
          };
          return parsed.nonce === approvedNonce;
        },
      },
      undefined,
      undefined,
      undefined,
      { useMockSubmission: true },
      nonceStore
    );
    const service = new ScheduledTransferService(store, relayService);
    const start = new Date('2026-01-01T00:00:00.000Z');
    const transfer = await service.create(validBody(start.toISOString()), 'caller-a');

    expect(await service.processDueTransfers(start)).toBe(1);
    expect(await service.processDueTransfers(new Date('2026-01-02T00:00:00.000Z'))).toBe(1);

    const logs = await service.listExecutions(transfer.id, 'caller-a');
    expect(logs.filter((log) => log.outcome === 'success')).toHaveLength(2);
    expect(store.getById(transfer.id)?.status).toBe('active');
    expect(store.getById(transfer.id)?.consecutiveFailures).toBe(0);
    expect(() => nonceStore.assertFresh(VALID_KEY, approvedNonce)).toThrow('Nonce already used');
    expect(() => nonceStore.assertFresh(VALID_KEY, approvedNonce + 1)).toThrow(
      'Nonce already used'
    );
  });

  it('scopes pause/cancel/get to the owning caller', async () => {
    const store = new ScheduledTransferStore();
    const relayService = new RelayService({ verify: () => true });
    const service = new ScheduledTransferService(store, relayService);

    const transfer = await service.create(validBody('2099-01-01T00:00:00.000Z'), 'caller-a');

    expect((await service.get(transfer.id, 'caller-a'))?.id).toBe(transfer.id);
    expect(await service.get(transfer.id, 'caller-b')).toBeUndefined();
    expect(await service.pause(transfer.id, 'caller-b')).toBeUndefined();
    expect(await service.cancel(transfer.id, 'caller-b')).toBeUndefined();
  });
});
