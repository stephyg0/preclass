// Watch only the reply to the prompt sent by this handoff, never an older answer.
globalThis.preclassWatchResponse = ({prompt, beforeUserCount, onReady, onStatus}) => {
  let watchedURL = location.href;
  let canCreateChat = !location.pathname.includes('/c/');
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  const expected = normalize(prompt);
  const started = Date.now();
  let lastText = '', stableSince = 0;
  const stop = () => clearInterval(timer);
  const timer = setInterval(() => {
    // A new-chat URL becomes /c/... after sending; other navigation ends this watch.
    if (location.href !== watchedURL) {
      if (canCreateChat && location.pathname.includes('/c/')) {
        watchedURL = location.href; canCreateChat = false;
      } else { stop(); return; }
    }
    if (Date.now() - started > 20 * 60 * 1000) {
      stop(); onStatus('Automatic copy timed out. Use ChatGPT’s Copy button when the guide is ready.'); return;
    }
    const messages = [...document.querySelectorAll('[data-message-author-role="user"], [data-message-author-role="assistant"]')];
    const users = messages.filter(el => el.getAttribute('data-message-author-role') === 'user');
    const user = users[beforeUserCount];
    if (!user || normalize(user.innerText) !== expected) return;
    // Do not copy a later conversation turn if the user continues the chat.
    if (users.length > beforeUserCount + 1) { stop(); return; }
    const reply = messages.slice(messages.indexOf(user) + 1).find(el => el.getAttribute('data-message-author-role') === 'assistant');
    if (!reply) return;
    const body = reply.querySelector('.markdown') || reply;
    const text = body.innerText.trim();
    if (text !== lastText) { lastText = text; stableSince = Date.now(); }
    const turn = reply.closest('[data-testid^="conversation-turn-"], article');
    const generating = document.querySelector('[data-testid="stop-button"], button[aria-label="Stop generating"], [data-is-streaming="true"]');
    const complete = turn?.querySelector('button[data-testid="copy-turn-action-button"], button[aria-label="Copy"], button[aria-label="Copy response"]');
    // Require a completed-turn action as well as settled text, not just a streaming pause.
    if (!text || generating || !complete || complete.disabled || Date.now() - stableSince < 2000) return;
    stop(); onReady(text);
  }, 500);
  return stop;
};
