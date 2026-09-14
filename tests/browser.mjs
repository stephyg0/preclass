import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {collectPage} from '../extension/core.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory=await mkdtemp(join(tmpdir(),'preclass-test-'));
const extension=resolve('extension');
const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
context.setDefaultTimeout(10000);
try {
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).host;
 const page=await context.newPage();
 await page.route('https://forum.minerva.edu/**',route=>route.fulfill({contentType:'text/html',body:'<nav><a href="/home">Home</a></nav><main><h1>CS142 Session 4</h1><p>Read Chapter 3. <a href="https://example.com/syllabus">Syllabus</a></p><h2>Readings</h2><h3>Required textbook</h3><ul><li><a href="https://example.com/book.pdf">The textbook</a> — Chapter 3</li><li><a href="https://example.com/book.pdf">Duplicate</a></li><li hidden><a href="https://example.com/hidden">Hidden</a></li><li><a href="javascript:alert(1)">Unsafe</a></li></ul><h2>Study guide</h2><p>Why does induction work?</p><a href="https://example.com/guide">Guide link</a></main>'}));
 await page.goto('https://forum.minerva.edu/session');
 const data=await page.evaluate(collectPage);
 assert.equal(data.course,'CS142');assert.equal(data.links.length,1);assert.equal(data.links[0].pdf,true);assert.match(data.links[0].context,/Chapter 3/);assert.equal(data.questions.length,1);
 await page.evaluate(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('ul'));getSelection().removeAllRanges();getSelection().addRange(r);});
 const selected=await page.evaluate(collectPage);assert.equal(selected.selected,true);assert.ok(!selected.text.includes('Why does induction work?'));
 assert.equal(selected.links.length,1);
 const fixture=await context.newPage();
 for (const [html,expected] of [
   ['<main><a href="https://example.com/a">Uncategorized</a></main>',0],
   ['<main><h2>Readings</h2><h2>Questions</h2><a href="https://example.com/a">Question resource</a></main>',0],
   ['<main><section><h2>Readings:</h2><a href="https://example.com/a">Book</a></section><a href="https://example.com/b">Outside section</a></main>',1],
   ['<main><p><strong>Readings</strong></p><a href="https://example.com/a">Book</a><p><strong>Study guide</strong></p><a href="https://example.com/b">Other</a></main>',1],
   ['<main><h2>Readings</h2><h3>Source one</h3><a href="https://example.com/a">Book</a><h3>Source two</h3><a href="https://example.com/b">Paper</a><h2>Resources</h2><a href="https://example.com/c">Other</a></main>',2]
 ]) {await fixture.setContent(html);assert.equal((await fixture.evaluate(collectPage)).links.length,expected,html);}
 await fixture.close();
 console.log('PASS readings-only collection, heading boundaries, missing/empty sections, nested titles, selection');
 const popup=await context.newPage();const errors=[];popup.on('pageerror',e=>errors.push(e.message));
 await popup.goto(`chrome-extension://${id}/popup.html`);
 await popup.locator('#demo').click();
 assert.match(await popup.locator('#prompt').inputValue(),/Mathematics for Computer Science/);
 await popup.locator('#resource-0').uncheck();assert.match(await popup.locator('#prompt').inputValue(),/No reading links detected/);
 await popup.locator('#resource-0').check();
 await popup.locator('#destination').fill('https://chatgpt.com/c/test');await popup.locator('#save').click();
 await popup.waitForFunction(()=>document.querySelector('#status').textContent.includes('saved'));
 const stored=await worker.evaluate(()=>chrome.storage.local.get('courses'));assert.equal(stored.courses.CS142,'https://chatgpt.com/c/test');
 await popup.screenshot({path:resolve('preview.png'),fullPage:true});
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><textarea id="prompt-textarea"></textarea><button id="send" data-testid="send-button" onclick="window.sent=(window.sent||0)+1">Send</button></main>'}));
 const opened=context.waitForEvent('page');await popup.locator('#open').click();const chat=await opened;
 await chat.waitForURL('https://chatgpt.com/c/test');
 await chat.waitForFunction(()=>document.querySelector('#prompt-textarea')?.value.includes('CS142'));
 await chat.waitForFunction(()=>window.sent===1);
 assert.equal(await chat.evaluate(()=>window.sent),1);
 const pending=await worker.evaluate(()=>chrome.storage.session.get(null));assert.equal(Object.keys(pending).length,0);
 console.log('PASS extension UI, saved destination, service-worker handoff, automatic submission exactly once');
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://chatgpt.com'});
 await chat.bringToFront();
 await chat.evaluate(async()=>{
   await navigator.clipboard.writeText('clipboard sentinel');
   const older=document.createElement('article');older.innerHTML='<div data-message-author-role="assistant">Old answer</div><button data-testid="copy-turn-action-button">Copy</button>';document.body.append(older);
   const user=document.createElement('div');user.setAttribute('data-message-author-role','user');user.textContent=document.querySelector('#prompt-textarea').value;document.body.append(user);
   const article=document.createElement('article');article.id='new-reply';article.innerHTML='<div data-message-author-role="assistant"><div class="markdown">Partial guide</div></div><button data-testid="stop-button">Stop</button>';document.body.append(article);
 });
 // Long pauses in streaming must never trigger a copy.
 await chat.waitForTimeout(3000);
 assert.equal(await chat.evaluate(()=>navigator.clipboard.readText()),'clipboard sentinel');
 await chat.evaluate(()=>{
   document.querySelector('#new-reply .markdown').textContent='Study guide\nInduction\nProve the base case, then the inductive step.';
   document.querySelector('[data-testid="stop-button"]').remove();
   const copy=document.createElement('button');copy.dataset.testid='copy-turn-action-button';copy.textContent='Copy';document.querySelector('#new-reply').append(copy);
 });
 for(let attempt=0;attempt<20;attempt++){
   if((await chat.evaluate(()=>navigator.clipboard.readText())).startsWith('Study guide'))break;
   await chat.waitForTimeout(500);
 }
 assert.equal(await chat.evaluate(()=>navigator.clipboard.readText()),await chat.locator('#new-reply .markdown').innerText());
 console.log('PASS automatic clipboard copy of only the finished new reply, never old or streaming text');
 await chat.locator('#preclass-handoff').screenshot({path:resolve('banner-preview.png')});
 await chat.locator('#preclass-handoff').waitFor({state:'detached',timeout:20000});
 console.log('PASS completed banner automatically disappears after its countdown');
 await context.unroute('https://chatgpt.com/**');
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<textarea id="prompt-textarea">My existing draft</textarea><button data-testid="send-button" onclick="window.sent=true">Send</button>'}));
 const next=context.waitForEvent('page');await popup.locator('#open').click();const draft=await next;await draft.waitForURL('https://chatgpt.com/c/test');
 await draft.waitForFunction(()=>document.querySelector('div[style*="position: fixed"]'));
 assert.equal(await draft.locator('#prompt-textarea').inputValue(),'My existing draft');
 assert.equal(await draft.evaluate(()=>window.sent),undefined);
 console.log('PASS existing draft preservation without submission');
 await context.unroute('https://chatgpt.com/**');
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<div id="prompt-textarea" contenteditable="true" style="min-height:50px"></div><button data-testid="send-button" onclick="window.sent=true">Send</button>'}));
 const richOpened=context.waitForEvent('page');await popup.locator('#open').click();const rich=await richOpened;
 await rich.waitForURL('https://chatgpt.com/c/test');
 await rich.waitForFunction(()=>document.querySelector('#prompt-textarea')?.innerText.includes('CS142'));
 assert.match(await rich.locator('#prompt-textarea').innerText(),/Mathematics for Computer Science/);
 await rich.waitForFunction(()=>window.sent===true);
 console.log('PASS rich-text composer automatic submission');
 await context.unroute('https://chatgpt.com/**');
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:`
   <button hidden data-testid="send-button" onclick="window.wrong=true">Hidden Send</button>
   <button aria-label="Stop answering" onclick="window.wrong=true">Stop</button>
   <textarea id="prompt-textarea"></textarea>
   <button id="composer-submit-button" aria-label="Send" disabled onclick="window.sent=(window.sent||0)+1;const u=document.createElement('div');u.dataset.messageAuthorRole='user';u.textContent=document.querySelector('#prompt-textarea').value;document.body.append(u);document.querySelector('#prompt-textarea').value='';">Send</button>
   <script>document.querySelector('textarea').addEventListener('input',()=>setTimeout(()=>{const old=document.querySelector('textarea');const fresh=old.cloneNode();fresh.value=old.value;old.replaceWith(fresh);document.querySelector('#composer-submit-button').disabled=false;},600));</script>
 `}));
 const rebuiltOpened=context.waitForEvent('page');await popup.locator('#open').click();const rebuilt=await rebuiltOpened;
 await rebuilt.waitForURL('https://chatgpt.com/c/test');
 await rebuilt.waitForFunction(()=>window.sent===1);
 assert.equal(await rebuilt.evaluate(()=>window.wrong),undefined);
 assert.equal(await rebuilt.locator('[data-message-author-role="user"]').count(),1);
 console.log('PASS delayed Send label, replaced composer, hidden duplicate, Stop exclusion, confirmed submission');
 const panelOpened=context.waitForEvent('page');await page.mouse.click(1180,675);const panel=await panelOpened;
 await panel.waitForURL(`chrome-extension://${id}/popup.html?tab=*`);
 await panel.waitForFunction(()=>document.querySelector('#review').hidden===false);
 assert.match(await panel.locator('#prompt').inputValue(),/The textbook/);
 console.log('PASS floating launcher to collection in extension review tab');
 assert.deepEqual(errors,[]);
} finally {await context.close();await rm(directory,{recursive:true,force:true});}
