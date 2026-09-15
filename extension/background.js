import {conversationURL,studyContextKey,workbookDestination} from './chat-context.js';
import { googleSearchURL } from './search.js';
import { destination } from './core.js';
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    if (message.type === 'search-reading' && sender.url?.startsWith(chrome.runtime.getURL(''))) {
      if(typeof message.title!=='string' || !message.title.trim() || message.title.length>600)throw Error('Invalid reading title.');
      const response=await fetch(googleSearchURL(message.title),{credentials:'omit',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('Google search was unavailable. Open the search manually.');
      const html=await response.text();
      if(html.length>3000000)throw Error('Google returned an unexpected response. Open the search manually.');
      return {html};
    }
    if (message.type === 'get-study-context' && sender.url?.startsWith(chrome.runtime.getURL(''))) {
      const key=studyContextKey(message.course,message.sourceURL);
      return {context:(await chrome.storage.local.get('study:'+key))['study:'+key] || null};
    }
    if (message.type === 'guide-state' && sender.tab && new URL(sender.url).origin === 'https://chatgpt.com') {
      const routeKey='guide-tab:'+sender.tab.id;
      const route=(await chrome.storage.session.get(routeKey))[routeKey];
      if(!route)return {};
      route.submitted=true;
      if(message.phase==='ready')route.ready=true;
      await chrome.storage.session.set({[routeKey]:route});
      const currentTab=await chrome.tabs.get(sender.tab.id);
      await saveStudyConversation(sender.tab.id,currentTab.url,route);
      return {ok:true};
    }
    if (message.type === 'handoff' && sender.url?.startsWith(chrome.runtime.getURL(''))) {
      if (typeof message.prompt !== 'string' || !message.prompt.trim() || message.prompt.length > 200000) throw new Error('Prompt must contain 1–200,000 characters.');
      const mode=message.mode==='workbook'?'workbook':'study';
      const key=studyContextKey(message.course,message.sourceURL);
      const context=(await chrome.storage.local.get('study:'+key))['study:'+key];
      const url=mode==='workbook' ? workbookDestination(context,message.url) : destination(message.url);
      const tab = await chrome.tabs.create({url:'about:blank'});
      await chrome.storage.session.set({['pending:'+tab.id]:{prompt:message.prompt,mode,created:Date.now()}});
      if(mode==='study'){
        await chrome.storage.session.set({['guide-tab:'+tab.id]:{key,submitted:false,ready:false}});
        await chrome.storage.local.set({['study:'+key]:{url:null,ready:false,tabId:tab.id}});
      }
      try { await chrome.tabs.update(tab.id,{url}); } catch (error) { await chrome.storage.session.remove(['pending:'+tab.id,'guide-tab:'+tab.id]); throw error; }
      return {ok:true,url,mode};
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
async function saveStudyConversation(tabId,url,route){
  if(!route.submitted)return;
  let chat;try{chat=conversationURL(url);}catch{return;}
  const storageKey='study:'+route.key;
  const current=(await chrome.storage.local.get(storageKey))[storageKey];
  // An older study-guide tab must not overwrite the newer guide for this pre-class work.
  if(current?.tabId!==tabId)return;
  await chrome.storage.local.set({[storageKey]:{url:chat,ready:route.ready,tabId}});
}
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(!change.url)return;
  (async()=>{const key='guide-tab:'+tabId;const route=(await chrome.storage.session.get(key))[key];if(route)await saveStudyConversation(tabId,change.url,route);})().catch(()=>{});
});
chrome.tabs.onRemoved.addListener(id=>chrome.storage.session.remove(['pending:'+id,'guide-tab:'+id]));
