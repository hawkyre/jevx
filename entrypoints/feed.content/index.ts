import { browser } from 'wxt/browser';
import { checkPost, getState, send } from '../../lib/client';
import { startFeed } from '../../lib/feed';
import './style.css';

export default defineContentScript({
  matches: ['https://x.com/*'],
  main(ctx) {
    const feed = startFeed({
      state: getState, check: checkPost,
      toggle: enabled => send({ type: 'toggle', enabled }),
      override: (post, show) => send({ type: 'override', post, show }),
      explore: query => send({ type: 'explore', query }),
    });
    const changed = (message: unknown) => {
      if ((message as { type?: string } | null)?.type === 'changed') void feed.refresh().catch(() => undefined);
    };
    browser.runtime.onMessage.addListener(changed);
    ctx.addEventListener(window, 'wxt:locationchange', () => { void feed.refresh().catch(() => undefined); });
    ctx.onInvalidated(() => { browser.runtime.onMessage.removeListener(changed); feed.dispose(); });
  },
});
