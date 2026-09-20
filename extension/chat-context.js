import {destination} from './core.js';
export function conversationURL(value) {
  const url=new URL(destination(value));
  if(!/\/c\/[^/]+\/?$/.test(url.pathname))throw Error('Paste the study guide’s conversation URL, not a ChatGPT project page.');
  url.search='';url.hash='';return url.href;
}
export function studyContextKey(course,sourceURL) {
  let source='';
  try{const url=new URL(sourceURL);source=url.origin+url.pathname;}catch{}
  return JSON.stringify([String(course || '').trim().toUpperCase(),source]);
}
export function workbookDestination(manualURL) {
  return destination(manualURL);
}
