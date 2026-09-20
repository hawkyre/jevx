import { describe, expect, it, vi } from 'vitest';
const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage } } }));
import { send } from '../lib/client';

describe('extension connection errors', () => {
  it('asks for a tab reload after the extension context is invalidated', async () => {
    sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated.'));
    await expect(send({ type: 'state' })).rejects.toThrow('Extension updated. Reload this X tab.');
  });
});
