import { browser } from 'wxt/browser';
import type { Post, PostResult, PublicState, Settings } from './model';

export async function send<T>(message: Record<string, unknown>): Promise<T> {
  const response = await browser.runtime.sendMessage(message) as { ok: boolean; value?: T; error?: string };
  if (!response?.ok) throw new Error(response?.error ?? 'The extension is unavailable. Reload this tab.');
  return response.value as T;
}

export const getState = () => send<PublicState>({ type: 'state' });
export const saveSettings = (settings: Settings) => send<PublicState>({ type: 'settings', settings });
export const checkPost = (post: Post) => send<PostResult>({ type: 'assess', post });
