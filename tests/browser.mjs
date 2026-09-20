import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {collectPage} from '../extension/core.js';
import {collectWorkbook,mergeWorkbookResults} from '../extension/workbook.js';
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
   ['<main><h2>Readings</h2><p>Smith, A. (2024). The psychology of learning.</p><h2>Study guide</h2><p>Jones, B. (2020). Not a reading.</p></main>',1],
   ['<main><h2>Readings</h2><h3>Understanding complex systems</h3><p>Read chapter three before class.</p></main>',1],
   ['<main><h2>Readings</h2><p><strong>Smith, A. (2024). The psychology of learning.</strong></p></main>',1],
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
 const searchResults=await popup.evaluate(async()=>{
   const {parseGoogleResults}=await import('./search.js');
   return [
     parseGoogleResults('<a href="https://publisher.example/book"><h3>The psychology of learning</h3></a>','Smith, A. (2024). The psychology of learning.'),
     parseGoogleResults('<a href="https://example.com/wrong"><h3>Unrelated material</h3></a>','The psychology of learning'),
     parseGoogleResults('<p>Our systems have detected unusual traffic</p>','The psychology of learning')
   ];
 });
 assert.equal(searchResults[0].candidates[0].url,'https://publisher.example/book');
 assert.equal(searchResults[1].state,'not-found');assert.equal(searchResults[2].state,'blocked');
 console.log('PASS Google result matching, missing matches, blocked-search handling');
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
 const pending=await worker.evaluate(()=>chrome.storage.session.get(null));assert.equal(Object.keys(pending).filter(key=>key.startsWith('pending:')).length,0);
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
 await chat.waitForTimeout(6000);
 assert.equal(await chat.locator('#preclass-handoff').count(),0);
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
 console.log('PASS banner fills and disappears after five seconds while background copying continues');
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
 const sourceTab=await worker.evaluate(async()=> (await chrome.tabs.query({url:'https://forum.minerva.edu/session'}))[0]);
 const panel=await context.newPage();await panel.goto(`chrome-extension://${id}/popup.html?tab=${sourceTab.id}`);
 await panel.waitForURL(`chrome-extension://${id}/popup.html?tab=*`);
 await panel.waitForFunction(()=>document.querySelector('#review').hidden===false);
 assert.match(await panel.locator('#prompt').inputValue(),/The textbook/);
 console.log('PASS collection in extension review tab');
 await page.evaluate(()=>{
   getSelection().removeAllRanges();
   const citation=document.createElement('p');citation.textContent='Smith, A. (2024). The psychology of learning.';
   [...document.querySelectorAll('h2')].find(h=>h.textContent==='Study guide').before(citation);
 });
 await panel.locator('#collect').click();
 await panel.waitForFunction(()=>document.querySelector('#prompt').value.includes('SOURCE NOT LINKED'));
 assert.equal(await panel.locator('#search-missing').isVisible(),true);
 // Simulate Google and its permission grant; do not query the real service in tests.
 await worker.evaluate(()=>{globalThis.fetch=async()=>new Response('<a href="https://publisher.example/book"><h3>The psychology of learning</h3></a>');});
 await panel.evaluate(()=>{chrome.permissions.contains=async()=>true;});
 await panel.locator('#search-missing').click();
 await panel.getByRole('button',{name:'Use: The psychology of learning'}).click();
 assert.match(await panel.locator('#prompt').inputValue(),/https:\/\/publisher.example\/book/);
 assert.ok(!(await panel.locator('#prompt').inputValue()).includes('SOURCE NOT LINKED'));
 assert.equal(await panel.locator('#search-status').innerText(),'All reading links confirmed.');
 console.log('PASS unlinked citation → Google lookup → confirmed source in prompt');
 await panel.locator('#tab-workbook').click();
 assert.equal(await panel.locator('#tab-workbook').getAttribute('aria-selected'),'true');
 await panel.locator('#demo').click();
 assert.match(await panel.locator('#prompt').inputValue(),/ALL 2 WORKBOOK QUESTIONS/);
 await panel.locator('#tab-study').click();
 assert.match(await panel.locator('#prompt').inputValue(),/publisher.example/);
 await panel.locator('#tab-workbook').click();
 await page.evaluate(()=>{
   document.body.innerHTML='<main><h1>CS142 Forum</h1><iframe title="Workbook"></iframe></main>';
   document.querySelector('iframe').srcdoc='<h1>Finite State Machines</h1>'+Array.from({length:10},(_,i)=>'<section><p>Question '+(i+1)+' of 10</p><h2>Task '+(i+1)+'</h2><p>Explain the reasoning for part '+(i+1)+'.</p><div role="toolbar">Normal Bold</div><div contenteditable="true">My saved answer</div></section>').join('');
 });
 await page.waitForFunction(()=>document.querySelector('iframe').contentDocument?.body.textContent.includes('Question 10'));
 await panel.locator('#collect').click();
 await panel.waitForFunction(()=>document.querySelector('#counts').textContent.includes('10 of 10'));
 assert.equal(await panel.locator('#open').isEnabled(),true);
 assert.match(await panel.locator('#prompt').inputValue(),/Task 10/);
 assert.ok(!(await panel.locator('#source').inputValue()).includes('My saved answer'));
 assert.ok(!(await panel.locator('#source').inputValue()).includes('Normal Bold'));
 await panel.screenshot({path:resolve('workbook-preview.png'),fullPage:true});
 await panel.locator('#copy').click();
 await panel.waitForFunction(()=>document.querySelector('#status').textContent==='Workbook questions copied.');
 await chat.bringToFront();
 assert.match(await chat.evaluate(()=>navigator.clipboard.readText()),/Question 10 of 10/);
 await panel.bringToFront();
 const workbookSent=context.waitForEvent('page');await panel.locator('#open').click();const workbookChat=await workbookSent;
 await workbookChat.waitForURL('https://chatgpt.com/c/test');
 await workbookChat.waitForFunction(()=>window.sent===1);
 assert.match(await workbookChat.locator('[data-message-author-role="user"]').innerText(),/ALL 10 WORKBOOK QUESTIONS/);
 // A workbook that exposes only one of ten questions must never be sent as complete.
 await page.evaluate(()=>{document.querySelector('iframe').srcdoc='<h1>Finite State Machines</h1><p>Question 1 of 10</p><p>Define a DFA.</p>';});
 await page.waitForFunction(()=>document.querySelector('iframe').contentDocument?.body.textContent.includes('Define a DFA'));
 await panel.locator('#collect').click();
 await panel.waitForFunction(()=>document.querySelector('#counts').textContent.includes('1 of 10'));
 assert.equal(await panel.locator('#open').isEnabled(),false);
 console.log('PASS workbook tab, independent tab drafts, all 10 embedded questions, answer exclusion, clipboard, incomplete-send prevention');
 await context.route('https://workbook.example/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Private workbook</h1><p>Question 1 of 1</p><p>Explain the theorem.</p>'}));
 await page.evaluate(()=>{document.body.innerHTML='<main><h1>CS142 Forum</h1><iframe style="width:500px;height:300px" src="https://workbook.example/session"></iframe><a href="https://workbook.example/session">Open in New Tab</a></main>';});
 await panel.locator('#collect').click();
 await panel.waitForFunction(()=>!document.querySelector('#workbook-access').hidden);
 assert.equal(await panel.locator('#open').isEnabled(),false);
 assert.equal(await panel.getByRole('link',{name:'Open full workbook'}).getAttribute('href'),'https://workbook.example/session');
 console.log('PASS cross-origin workbook access prompt and open-in-new-tab fallback');
 // A stale saved completion state must neither override the entered URL nor block sending.
 await context.unroute('https://chatgpt.com/**');
 await context.route('https://chatgpt.com/**',route=>{
   const isProject=new URL(route.request().url()).pathname.endsWith('/project');
   const initial=isProject?'':'<article><div data-message-author-role="assistant"><div class="markdown">Existing study guide and reading context</div></div><button data-testid="copy-turn-action-button">Copy</button></article>';
   route.fulfill({contentType:'text/html',body:initial+`<textarea id="prompt-textarea"></textarea><button data-testid="send-button" onclick="window.sent=true;const u=document.createElement('div');u.dataset.messageAuthorRole='user';u.textContent=document.querySelector('textarea').value;document.body.append(u);document.querySelector('textarea').value='';if(location.pathname.endsWith('/project')){history.pushState({},'', '/g/g-p-course/c/study-context');const a=document.createElement('article');a.innerHTML='<div data-message-author-role=&quot;assistant&quot;><div class=&quot;markdown&quot;>Existing study guide and reading context</div></div><button data-testid=&quot;copy-turn-action-button&quot;>Copy</button>';document.body.append(a);}">Send</button>`});
 });
 await popup.locator('#tab-study').click();await popup.locator('#demo').click();
 await popup.locator('#destination').fill('https://chatgpt.com/g/g-p-course/project');
 const guideOpened=context.waitForEvent('page');await popup.locator('#open').click();const guide=await guideOpened;
 await guide.waitForURL('https://chatgpt.com/g/g-p-course/c/study-context');
 for(let attempt=0;attempt<30;attempt++){
   const saved=await worker.evaluate(()=>chrome.storage.local.get(null));
   if(Object.entries(saved).some(([key,value])=>key.startsWith('study:') && value.ready && value.url==='https://chatgpt.com/g/g-p-course/c/study-context'))break;
   await popup.waitForTimeout(250);
 }
 const recorded=await worker.evaluate(()=>chrome.storage.local.get(null));
 assert.ok(Object.entries(recorded).some(([key,value])=>key.startsWith('study:') && value.ready && value.url==='https://chatgpt.com/g/g-p-course/c/study-context'),JSON.stringify(recorded));
 await popup.locator('#tab-workbook').click();await popup.locator('#demo').click();
 await popup.locator('#destination').fill('https://chatgpt.com/g/g-p-course/c/chosen-context');
 await worker.evaluate(async()=>{
   const saved=await chrome.storage.local.get(null);
   for(const [key,value] of Object.entries(saved))if(key.startsWith('study:'))await chrome.storage.local.set({[key]:{...value,ready:false}});
 });
 assert.equal(await popup.locator('#destination').inputValue(),'https://chatgpt.com/g/g-p-course/c/chosen-context');
 assert.ok(!(await popup.locator('#context-status').innerText()).includes('still being prepared'));
 assert.match(await popup.locator('#prompt').inputValue(),/Use that study guide, the assigned readings/);
 const followupOpened=context.waitForEvent('page');await popup.locator('#open').click();const followup=await followupOpened;
 await followup.waitForURL('https://chatgpt.com/g/g-p-course/c/chosen-context');
 await followup.waitForFunction(()=>window.sent===true);
 assert.match(await followup.locator('[data-message-author-role="assistant"]').innerText(),/Existing study guide and reading context/);
 assert.match(await followup.locator('[data-message-author-role="user"]').innerText(),/ALL 2 WORKBOOK QUESTIONS/);
 console.log('PASS workbook sends to the entered chat despite stale saved completion status');
 assert.deepEqual(errors,[]);
} finally {await context.close();await rm(directory,{recursive:true,force:true});}
