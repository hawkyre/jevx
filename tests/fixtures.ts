import { DEFAULT_SETTINGS, type Post, type PublicState } from '../lib/model';

export function post(overrides: Partial<Post> = {}): Post {
  return { id: '123456789', author: 'builder', text: 'How do you help learners remember vocabulary?', quotedText: '', createdAt: Date.now(), kind: 'post', incomplete: false, ...overrides };
}

export function readyState(): PublicState {
  return { connected: true, settings: { ...structuredClone(DEFAULT_SETTINGS), consent: true, profile: { background: 'I build language learning tools.', interests: 'Language learning and vocabulary retention.', audience: 'Language learners and educators.', exclusions: 'Crypto and giveaways.' } } };
}

export function articleHtml(value: Post, reply = false): string {
  return `<article data-testid="tweet" role="article" aria-labelledby="author-${value.id} text-${value.id}"><div>
    <div data-testid="User-Name" id="author-${value.id}"><a href="/${value.author}">@${value.author}</a><a href="/${value.author}/status/${value.id}"><time datetime="${new Date(value.createdAt).toISOString()}">now</time></a></div>
    ${reply ? '<div dir="ltr">Replying to <a href="/someone">@someone</a></div>' : ''}
    <div data-testid="tweetText" id="text-${value.id}"></div>
    <button data-testid="reply">Reply</button><button data-testid="retweet">Repost</button>
    </div></article>`;
}

export function article(value: Post, reply = false): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = articleHtml(value, reply);
  const element = wrapper.firstElementChild as HTMLElement;
  element.querySelector('[data-testid="tweetText"]')!.textContent = value.text;
  return element;
}
