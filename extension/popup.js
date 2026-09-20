import {googleSearchURL,parseGoogleResults} from './search.js';
import {collectPage,promptFor,destination} from './core.js';
import {collectWorkbook,mergeWorkbookResults,workbookPrompt} from './workbook.js';
const $=id=>document.getElementById(id);
let data, courses={}, mode='study', sourceURL='', sourceTabId=Number(new URLSearchParams(location.search).get('tab')) || null;
const cache={};
let workbookOrigins=[];
const api=globalThis.chrome?.runtime?.id;
const status=text=>{$('status').textContent=text;$('status').hidden=!text;};
function showStudyContext(){
  if(mode!=='workbook')return;
  $('context-status').hidden=false;
  $('context-status').textContent='Sends directly to the ChatGPT link you enter. Use your study-guide chat to keep its readings and context.';
}

function refresh(){
  if(!data)return;
  data.course=$('course').value;data.title=$('title').value;data.text=$('source').value;
  if(mode==='study')data.questions=$('questions').value.split('\n').filter(Boolean);
  const links=(data.links || []).filter((r,i)=>$('resource-'+i)?.checked);
  $('prompt').value=mode==='workbook' ? workbookPrompt(data) : promptFor({...data,links},{instructions:$('instructions').checked,context:$('context').checked,notes:$('notes').checked});
  const counts=mode==='workbook' ? [`${data.questions.length} of ${data.total || '?'} questions`,data.complete ? 'All questions collected' : 'Incomplete'] : [`${links.length} readings`,`${links.filter(x=>x.pdf).length} PDFs`,`${data.questions.length} questions`];
  $('counts').replaceChildren(...counts.map(x=>{const s=document.createElement('span');s.textContent=x;return s;}));
  $('open').disabled=mode==='workbook' && (!data.complete || !data.text.trim());
}
function render(result){
  data=result;$('review').hidden=false;$('course').value=data.course || '';$('title').value=data.title || '';$('source').value=data.text || '';
  $('questions').value=mode==='study' ? data.questions.join('\n') : '';
  $('resources').replaceChildren();
  (data.links || []).forEach((link,i)=>{
    const label=document.createElement('label');label.className='resource';
    const check=document.createElement('input');check.type='checkbox';check.id='resource-'+i;check.checked=link.selected!==false;check.onchange=()=>{link.selected=check.checked;refresh();};
    const text=document.createElement('span');text.textContent=link.title;
    const small=document.createElement('small');small.id='source-status-'+i;small.textContent=link.url ? link.url+(link.pdf?' · PDF':'') : 'Missing link · needs lookup';
    text.append(small);label.append(check,text);$('resources').append(label);
  });
  $('search-missing').hidden=mode!=='study' || !(data.links || []).some(r=>!r.url);$('search-status').textContent='';
  $('saved').value='';$('destination').value='';
  if(courses[data.course]){$('saved').value=data.course;$('destination').value=courses[data.course];}
  refresh();
  if(mode==='workbook')showStudyContext();
  if(mode==='workbook')status(data.complete ? `Collected all ${data.total} workbook questions. Review them below, then send to ChatGPT.` : `Found ${data.questions.length} of ${data.total || '?'} questions. Open the full workbook and load all questions before sending.`);
  else status((data.selected?'Collected selected text.':'Collected the visible pre-class work area.')+' Review the sources before continuing.'+(data.truncated?' Text exceeded 60,000 characters and was truncated. Select a smaller section.':''));
}
function switchMode(next){
  if(next===mode)return;
  if(data)cache[mode]={data,prompt:$('prompt').value,destination:$('destination').value};
  mode=next;data=undefined;
  for(const value of ['study','workbook']){$('tab-'+value).setAttribute('aria-selected',String(mode===value));$('tab-'+value).tabIndex=mode===value?0:-1;}
  $('review').setAttribute('aria-labelledby','tab-'+mode);
  $('destination-label').textContent=mode==='study'?'ChatGPT project or chat URL':'Study-guide conversation URL';
  $('context-status').hidden=mode!=='workbook';
  $('mode-hint').textContent=mode==='study' ? 'Create a study guide from the readings.' : 'Collect every workbook question, then copy and send them to ChatGPT.';
  $('collect').textContent=mode==='study' ? 'Collect pre-class work ↗' : 'Collect workbook questions ↗';
  for(const id of ['reading-hint','question-label','study-options','search-status'])$(id).hidden=mode==='workbook';
  $('source-label').textContent=mode==='study' ? 'Forum text' : 'All workbook questions · editable';
  $('source-details').open=mode==='workbook';
  $('handoff-hint').textContent=mode==='study' ? 'Sends your prompt, then copies the finished study guide for Google Docs.' : 'Copies the questions and continues in the study-guide chat, using its readings and context.';
  $('copy').textContent=mode==='study' ? 'Copy prompt' : 'Copy questions';
  $('workbook-access').hidden=true;$('workbook-links').replaceChildren();$('search-missing').hidden=true;
  if(cache[mode]){render(cache[mode].data);$('prompt').value=cache[mode].prompt;$('destination').value=cache[mode].destination;}
  else {$('review').hidden=true;status('');}
}
for(const value of ['study','workbook']){
  $('tab-'+value).onclick=()=>switchMode(value);
  $('tab-'+value).onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'study':e.key==='End'?'workbook':mode==='study'?'workbook':'study';switchMode(next);$('tab-'+next).focus();}};
}
async function collect(){
  if(!api){status('Preview mode. Load the extension in Chrome to collect a page, or try the sample.');return;}
  $('collect').disabled=true;
  const collectingMode=mode;
  try{
    const tab=sourceTabId ? await chrome.tabs.get(sourceTabId) : (await chrome.tabs.query({active:true,currentWindow:true}))[0];
    if(!tab?.id || !/^https?:/.test(tab.url || ''))throw Error('Open Forum pre-class work or the workbook in a regular browser tab, then click the extension.');
    sourceTabId=tab.id;sourceURL=tab.url;
    if(mode==='workbook'){
      let results;
      try{results=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:collectWorkbook});}
      catch{results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:collectWorkbook});}
      if(mode!==collectingMode)return;
      const result=mergeWorkbookResults(results);
      render(result);
      workbookOrigins=[...new Set([...result.frames,...result.workbookLinks].map(url=>new URL(url)).filter(url=>url.protocol==='https:' && url.origin!==new URL(tab.url).origin).map(url=>url.origin+'/*'))];
      $('workbook-access').hidden=result.complete || !workbookOrigins.length;
      $('workbook-links').replaceChildren();
      if(!result.complete)for(const url of result.workbookLinks){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open full workbook';$('workbook-links').append(a);}
      if(result.oversized)status('This workbook is too large to send in one prompt. Collect a smaller workbook or copy the questions in parts.');
    }else{
      const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:collectPage});
      if(mode!==collectingMode)return;
      if(!result?.result?.text)throw Error('No visible pre-class work text found. Expand the pre-class work and try again.');
      render(result.result);
      if(data.links.some(r=>!r.url) && await chrome.permissions.contains({origins:['https://www.google.com/*']}))await $('search-missing').onclick();
    }
  }catch(e){status(e.message);}finally{$('collect').disabled=false;}
}
$('collect').onclick=collect;
$('workbook-access').onclick=async()=>{
  try{
    if(!workbookOrigins.length)return;
    if(await chrome.permissions.request({origins:workbookOrigins}))await collect();
    else status('Workbook access was not granted. Open the full workbook in its own tab and collect it there.');
  }catch(e){status(e.message);}
};
$('demo').onclick=()=>mode==='study' ? render({course:'CS142',title:'Session 4 · Languages & computation',url:'https://forum.minerva.edu/example',text:'CS142 · Session 4\nRead Chapter 3 before class. Focus on the distinction between syntax and meaning.\nStudy guide\nWhat makes a proof by induction valid?\nExplain the role of the inductive hypothesis.',questions:['What makes a proof by induction valid?','Explain the role of the inductive hypothesis.'],links:[{title:'Mathematics for Computer Science',url:'https://courses.csail.mit.edu/6.042/spring18/mcs.pdf',pdf:true,context:'Chapter 3'}]}) : render({course:'CS142',title:'Finite State Machines',url:'https://forum.minerva.edu/example',total:2,complete:true,questions:[{number:1,total:2},{number:2,total:2}],text:'Question 1 of 2\nAny questions?\nAs you complete the reading, note your questions here.\n\nQuestion 2 of 2\nDefine a deterministic finite automaton. Explain each component of its formal definition.',links:[]});
for(const id of ['course','title','source','questions','instructions','context','notes'])$(id).addEventListener('input',refresh);
function listCourses(){$('saved').replaceChildren(new Option('New destination',''),...Object.keys(courses).sort().map(c=>new Option(c,c)));}
$('saved').onchange=()=>{const c=$('saved').value;if(c){$('course').value=c;$('destination').value=courses[c];refresh();}};
$('save').onclick=async()=>{try{const course=$('course').value.trim();if(!course)throw Error('Enter a course name first.');const url=destination($('destination').value);if(!api)throw Error('Saving is available after loading the extension in Chrome.');courses[course]=url;await chrome.storage.local.set({courses});listCourses();$('saved').value=course;status('Course destination saved on this browser.');}catch(e){status(e.message);}};
$('copy').onclick=async()=>{const text=mode==='workbook'?$('source').value:$('prompt').value;try{await navigator.clipboard.writeText(text);status(mode==='workbook'?'Workbook questions copied.':'Copied. Paste into ChatGPT and click Send.');}catch{const field=mode==='workbook'?$('source'):$('prompt');field.focus();field.select();status('Clipboard unavailable. The text is selected; press ⌘C or Ctrl+C.');}};
$('open').onclick=async()=>{try{
  if(mode==='workbook' && !data?.complete)throw Error('Collect all workbook questions before sending.');
  const url=destination($('destination').value);if(!api)throw Error('Load the extension in Chrome to enable the ChatGPT handoff.');
  if(mode==='workbook')try{await navigator.clipboard.writeText($('source').value);}catch{status('Clipboard unavailable; the questions will still be sent to ChatGPT.');}
  const result=await chrome.runtime.sendMessage({type:'handoff',url,prompt:$('prompt').value,mode,course:data?.course,sourceURL:sourceURL || data?.url});if(result.error)throw Error(result.error);status(mode==='workbook'?'Opened the study-guide conversation. Your workbook questions will be sent there.':'Opened ChatGPT. Your prompt will be inserted and sent automatically.');
}catch(e){status(e.message);}};
$('search-missing').onclick=async()=>{
  if(!api){status('Load the extension to search for missing reading links.');return;}
  const granted=await chrome.permissions.contains({origins:['https://www.google.com/*']}) || await chrome.permissions.request({origins:['https://www.google.com/*']});
  if(!granted){status('Google access was not granted. Missing titles remain in the prompt for ChatGPT to find.');return;}
  $('search-missing').disabled=true;
  const snapshot=data;
  try{
    for(let i=0;i<snapshot.links.length;i++){
      const reading=snapshot.links[i];
      if(reading.url || !$('resource-'+i)?.checked)continue;
      $('search-status').textContent='Searching Google for '+reading.title+'…';
      let result;
      try{
        const response=await chrome.runtime.sendMessage({type:'search-reading',title:reading.title});
        if(response.error)throw Error(response.error);
        result=parseGoogleResults(response.html,reading.title);
      }catch(error){result={state:'blocked',message:error.message,candidates:[]};}
      if(data!==snapshot)return;
      const row=$('source-status-'+i);
      row.textContent=result.message;
      const search=document.createElement('a');search.href=googleSearchURL(reading.title);search.target='_blank';search.rel='noopener noreferrer';search.textContent='Open Google search';
      const options=document.createElement('div');options.className='search-options';options.append(search);
      for(const candidate of result.candidates){
        const choice=document.createElement('button');choice.className='secondary';choice.textContent='Use: '+candidate.title;choice.title=candidate.url;
        choice.onclick=event=>{event.preventDefault();reading.url=candidate.url;reading.unlinked=false;reading.pdf=/\.pdf(?:$|[?#])/i.test(candidate.url);row.textContent=candidate.url;options.remove();refresh();const unresolved=data.links.filter(r=>!r.url).length;$('search-status').textContent=unresolved ? unresolved+' reading(s) still need a confirmed link.' : 'All reading links confirmed.';$('search-missing').hidden=!unresolved;};
        options.append(choice);
      }
      row.parentElement.querySelector('.search-options')?.remove();row.parentElement.append(options);
    }
    const remaining=snapshot.links.filter(r=>!r.url).length;
    $('search-status').textContent=remaining+' reading(s) still need a confirmed link. Review any matches above. Unresolved titles stay in the prompt and must be reported in the study guide.';
  }finally{$('search-missing').disabled=false;}
};

if(api){({courses={}}=await chrome.storage.local.get('courses'));listCourses();if(sourceTabId)collect();}
