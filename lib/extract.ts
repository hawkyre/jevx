import type { Post } from './model';

export const POST_SELECTOR = 'article[data-testid="tweet"]';

function ownElements(article: HTMLElement, selector: string): HTMLElement[] {
  return [...article.querySelectorAll<HTMLElement>(selector)].filter(element =>
    element.closest(POST_SELECTOR) === article && !element.closest('[data-jevx-ui]'));
}

export function extractPost(article: HTMLElement, pageUrl: string, language: string): Post | null {
  const page = new URL(pageUrl);
  const headers = ownElements(article, '[data-testid="User-Name"]');
  const time = headers[0]?.querySelector<HTMLElement>('time[datetime]') ??
    ownElements(article, 'time[datetime]').find(element => element.closest('a')?.getAttribute('href') === page.pathname);
  const permalink = time?.closest('a')?.getAttribute('href');
  if (!time || !permalink) return null;
  const match = new URL(permalink, 'https://x.com').pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)$/);
  if (!match?.[1] || !match[2]) return null;
  const texts = ownElements(article, '[data-testid="tweetText"]');
  const quoteHeader = headers[1];
  const primaryText = texts.find(element => !quoteHeader || Boolean(element.compareDocumentPosition(quoteHeader) & Node.DOCUMENT_POSITION_FOLLOWING));
  const text = primaryText?.textContent ?? '';
  const quotedText = texts.filter(element => element !== primaryText).map(element => element.textContent ?? '').join('\n');
  const createdAt = Date.parse(time.getAttribute('datetime') ?? '');
  if (!Number.isFinite(createdAt)) return null;
  const replyLabel = ownElements(article, 'div[dir]').some(element => {
    if (element.closest('[data-testid="tweetText"], [role="link"], [data-testid="User-Name"]')) return false;
    return [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && /^Replying to\s/.test(node.textContent ?? ''));
  });
  const inThread = /\/status\/\d+/.test(page.pathname);
  const isThreadRoot = page.pathname === `/${match[1]}/status/${match[2]}`;
  let kind: Post['kind'] = 'unknown';
  if (replyLabel) kind = 'reply';
  else if (inThread && !isThreadRoot) kind = 'reply';
  else if (!inThread && language.toLowerCase().startsWith('en')) kind = 'post';
  return {
    id: match[2], author: match[1], text, quotedText, createdAt, kind,
    incomplete: !text || Boolean(article.querySelector('[data-testid="tweet-text-show-more-link"]')) ||
      Boolean(article.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"]')),
  };
}
