import { destination } from './core.js';
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    if (message.type === 'open-panel' && sender.tab) {
      await chrome.tabs.create({url:chrome.runtime.getURL('popup.html') + '?tab=' + sender.tab.id}); return {ok:true};
    }
    if (message.type === 'handoff' && sender.url?.startsWith(chrome.runtime.getURL(''))) {
      if (typeof message.prompt !== 'string' || !message.prompt.trim() || message.prompt.length > 200000) throw new Error('Prompt must contain 1–200,000 characters.');
      const url = destination(message.url);
      const tab = await chrome.tabs.create({url:'about:blank'});
      await chrome.storage.session.set({['pending:'+tab.id]:{prompt:message.prompt,created:Date.now()}});
      try { await chrome.tabs.update(tab.id,{url}); } catch (error) { await chrome.storage.session.remove('pending:'+tab.id); throw error; }
      return {ok:true};
    }
    if (message.type === 'take' && sender.tab && new URL(sender.url).origin === 'https://chatgpt.com') {
      const key='pending:'+sender.tab.id;
      const item=(await chrome.storage.session.get(key))[key];
      if (!item) return {};
      if (Date.now()-item.created > 15*60*1000) { await chrome.storage.session.remove(key); return {}; }
      return item;
    }
    if (message.type === 'done' && sender.tab && new URL(sender.url).origin === 'https://chatgpt.com') {
      await chrome.storage.session.remove('pending:'+sender.tab.id); return {ok:true};
    }
    return {};
  })().then(respond).catch(e=>respond({error:e.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(id=>chrome.storage.session.remove('pending:'+id));
