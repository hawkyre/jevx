import { describe, expect, it } from 'vitest';
import { extractPost } from '../lib/extract';
import { article, post } from './fixtures';

describe('X post extraction', () => {
  it('reads the outer post date and preserves quoted text', () => {
    const value = post();
    const element = article(value);
    const quote = article(post({ id: '987654321', createdAt: 0 }));
    quote.removeAttribute('data-testid'); quote.removeAttribute('role');
    element.firstElementChild!.append(quote);
    const extracted = extractPost(element, 'https://x.com/home', 'en');
    expect(extracted?.id).toBe(value.id);
    expect(extracted?.createdAt).toBe(value.createdAt);
    expect(extracted?.quotedText).toBe(value.text);
  });
  it('does not treat the word Replying inside post text as a reply marker', () => {
    expect(extractPost(article(post({ text: 'Replying to questions is useful.' })), 'https://x.com/home', 'en')?.kind).toBe('post');
    expect(extractPost(article(post(), true), 'https://x.com/home', 'en')?.kind).toBe('reply');
  });
  it('does not mistake quoted text for a quote-only post body', () => {
    const element = article(post());
    element.querySelector('[data-testid="tweetText"]')!.remove();
    const quote = article(post({ id: '888', text: 'The quoted post' }));
    quote.removeAttribute('data-testid'); quote.removeAttribute('role');
    element.firstElementChild!.append(quote);
    const extracted = extractPost(element, 'https://x.com/home', 'en');
    expect(extracted?.text).toBe('');
    expect(extracted?.quotedText).toBe('The quoted post');
    expect(extracted?.incomplete).toBe(true);
  });
  it('keeps unsupported locales unknown and excludes replies inside a thread', () => {
    expect(extractPost(article(post()), 'https://x.com/home', 'ja')?.kind).toBe('unknown');
    expect(extractPost(article(post()), 'https://x.com/other/status/555', 'en')?.kind).toBe('reply');
  });
  it('rejects missing dates and marks media context incomplete', () => {
    const element = article(post());
    const image = document.createElement('div'); image.dataset.testid = 'tweetPhoto'; element.append(image);
    expect(extractPost(element, 'https://x.com/home', 'en')?.incomplete).toBe(true);
    element.querySelector('time')!.remove();
    expect(extractPost(element, 'https://x.com/home', 'en')).toBeNull();
  });
  it('uses the original date for reposts', () => {
    const original = post({ createdAt: 0 });
    const element = article(original);
    const context = document.createElement('div'); context.dataset.testid = 'socialContext'; context.textContent = 'Someone reposted';
    element.prepend(context);
    expect(extractPost(element, 'https://x.com/home', 'en')?.createdAt).toBe(0);
  });
});
