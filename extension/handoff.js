(async () => {
  const item = await chrome.runtime.sendMessage({type:'take'});
  if (!item?.prompt) return;
  const host=document.createElement('div');
  host.id='preclass-handoff';
  host.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483647';
  const shadow=host.attachShadow({mode:'closed'});
  const style=document.createElement('style');
  style.textContent=`
    *{box-sizing:border-box}
    section{width:320px;max-width:calc(100vw - 40px);padding:22px;background:#f7f5ee;color:#203d32;border:1px solid #cbd2c4;border-radius:14px;box-shadow:0 8px 32px #203d3220;font:14px/1.5 system-ui,-apple-system,sans-serif}
    header{display:flex;align-items:center;justify-content:space-between;gap:16px}
    .brand{font-size:13px;font-weight:800;letter-spacing:2px}
    p{font-size:13px;line-height:1.6;margin:16px 0;color:#697166}
    button{font:600 13px system-ui;border:1px solid #214c3d;background:#214c3d;color:#fff;border-radius:9px;padding:11px 15px;cursor:pointer}
    button:hover{filter:brightness(1.12)}
    button:focus-visible,textarea:focus-visible{outline:2px solid #879960;outline-offset:3px}
    textarea{width:100%;height:150px;margin-top:14px;padding:10px;background:#fffdf8;color:#253d31;border:1px solid #cbd2c4;border-radius:7px;font:13px/1.5 system-ui}
    .timer{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#748151 var(--progress,100%),#e1e3d9 0);flex-shrink:0}
    .timer span{width:26px;height:26px;border-radius:50%;background:#f7f5ee;display:grid;place-items:center;font-size:10px;font-variant-numeric:tabular-nums;color:#69735a}
    .timer.busy{background:conic-gradient(#748151 25%,#e1e3d9 0);animation:spin 1.2s linear infinite}
    .timer.busy span{font-size:0}
    @keyframes spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.timer.busy{animation:none}}
  `;
  const box=document.createElement('section');
  const header=document.createElement('header');
  const brand=document.createElement('div');brand.className='brand';brand.textContent='✦ PRECLASS';
  const circle=document.createElement('div');circle.className='timer';circle.setAttribute('role','timer');
  const seconds=document.createElement('span');circle.append(seconds);
  header.append(brand,circle);
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  let copyText=item.prompt, guideReady=false, cancelled=false, working=true;
  let stopWatching=()=>{};
  let remaining=15000, lastTick=Date.now();
  const setStatus=(text,busy=false)=>{
    status.textContent=text.replace(/^✦ (?:Preclass · )?/, '');
    working=busy;remaining=15000;lastTick=Date.now();
    circle.classList.toggle('busy',busy);
    circle.title=busy ? 'Working. The 15-second countdown starts when ready.' : 'Closes automatically. Hover or focus the banner to pause.';
    circle.setAttribute('aria-label',busy ? 'Working' : 'Closes in 15 seconds');
    seconds.textContent=busy ? '' : '15';circle.style.setProperty('--progress','100%');
  };
  const copy=document.createElement('button');copy.textContent='Copy prompt';
  const fallback=document.createElement('textarea');fallback.value=item.prompt;fallback.hidden=true;fallback.setAttribute('aria-label','Preclass prompt');
  copy.onclick=async()=>{
    try{await navigator.clipboard.writeText(copyText);setStatus(guideReady ? 'Study guide copied. Paste into your Google Doc.' : 'Copied. Paste into your chat and click Send.',working);}
    catch{fallback.value=copyText;fallback.hidden=false;fallback.focus();fallback.select();setStatus('Select the text below and copy it manually.',working);}
  };
  box.append(header,status,copy,fallback);shadow.append(style,box);document.body.append(host);
  setStatus('Looking for the composer…',true);
  const timer=setInterval(()=>{
    const now=Date.now(),elapsed=now-lastTick;lastTick=now;
    if(working || box.matches(':hover') || shadow.activeElement)return;
    remaining=Math.max(0,remaining-elapsed);
    seconds.textContent=String(Math.ceil(remaining/1000));
    circle.style.setProperty('--progress',`${remaining/15000*100}%`);
    circle.setAttribute('aria-label',`Closes in ${Math.ceil(remaining/1000)} seconds`);
    if(!remaining){clearInterval(timer);cancelled=true;stopWatching();chrome.runtime.sendMessage({type:'done'});host.remove();}
  },100);
  // Browsers represent blank lines differently in rich-text editors.
  const normalized=text=>text.replace(/\s+/g,' ').trim();
  const findComposer=()=>[...document.querySelectorAll('#prompt-textarea[contenteditable="true"], textarea#prompt-textarea, textarea[data-testid="prompt-textarea"]')].find(el=>el.getClientRects().length);
  const findSend=()=>[...document.querySelectorAll('button')].find(button=>{
    const label=(button.getAttribute('aria-label') || button.textContent || '').trim();
    const testid=button.getAttribute('data-testid') || '';
    if(/stop|voice|dictat/i.test(label+' '+testid))return false;
    const recognized=testid==='send-button' || /^(send|send prompt|send message|submit|submit prompt|submit message)$/i.test(label);
    return recognized && button.getClientRects().length && !button.disabled && button.getAttribute('aria-disabled')!=='true';
  });
  let filled=false;
  let composer;
  for(let attempt=0;attempt<60;attempt++) {
    if(cancelled) return;
    const editor=findComposer();
    if(editor && editor.getClientRects().length) {
      if ((editor.value ?? editor.innerText).trim()) {setStatus('Your composer already has a draft. Copy this prompt when you’re ready.');return;}
      composer=editor;
      editor.focus();
      if(editor.tagName==='TEXTAREA') {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,item.prompt);
        editor.dispatchEvent(new Event('input',{bubbles:true}));
      } else {
        document.execCommand('insertText',false,item.prompt);
      }
      filled=normalized(editor.value ?? editor.innerText) === normalized(item.prompt);
      break;
    }
    await new Promise(r=>setTimeout(r,500));
  }
  if (!filled) {
    setStatus('Open a chat in this project, then copy and paste your prompt.');
    return;
  }
  setStatus('✦ Preclass · Preparing to send…', true);
  const matchesPrompt=()=>{
    composer=findComposer();
    return composer && normalized(composer.value ?? composer.innerText) === normalized(item.prompt);
  };
  for(let attempt=0;attempt<240;attempt++) {
    if(cancelled) return;
    if(!findComposer()) {await new Promise(r=>setTimeout(r,250));continue;}
    if(!matchesPrompt()) {
      setStatus('The draft changed. Review it and send when ready.');
      return;
    }
    const send=findSend();
    if(send && send.getClientRects().length && !send.disabled && send.getAttribute('aria-disabled') !== 'true') {
      // Consume the handoff before clicking so reloading cannot submit it again.
      const result=await chrome.runtime.sendMessage({type:'done'});
      if(cancelled || !matchesPrompt()) return;
      if(!result?.ok) {setStatus('Could not finish the handoff. Click Send in ChatGPT.');return;}
      const beforeUserCount=document.querySelectorAll('[data-message-author-role="user"]').length;
      stopWatching=globalThis.preclassWatchResponse({
        prompt:item.prompt, beforeUserCount,
        onStatus:text=>{if(!cancelled)setStatus(text);},
        onReady:async text=>{
          if(cancelled)return;
          guideReady=true;copyText=text;copy.textContent='Copy study guide';
          fallback.value=text;fallback.setAttribute('aria-label','Study guide');
          try {
            await navigator.clipboard.writeText(text);
            if(!cancelled)setStatus('✦ Study guide copied. Paste into your Google Doc.');
          } catch {
            if(!cancelled)setStatus('Your study guide is ready. Click Copy study guide to copy it.');
          }
        }
      });
      // Re-resolve after the asynchronous handoff call; React may replace the button.
      const readySend=findSend();
      if(!readySend){stopWatching();continue;}
      readySend.click();
      setStatus('Confirming that ChatGPT received the prompt…',true);
      for(let check=0;check<120;check++){
        if(cancelled)return;
        const users=[...document.querySelectorAll('[data-message-author-role="user"]')];
        const received=users.slice(beforeUserCount).some(el=>normalized(el.innerText)===normalized(item.prompt));
        const current=findComposer();
        const generating=document.querySelector('[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop answering"]');
        if(received || (generating && current && !normalized(current.value ?? current.innerText))){
          setStatus('Waiting for the finished study guide to copy. Keep this tab open.',true);
          return;
        }
        await new Promise(r=>setTimeout(r,250));
      }
      stopWatching();
      setStatus('ChatGPT did not confirm submission. Your prompt is still available; click Send in ChatGPT.');
      return;
    }
    await new Promise(r=>setTimeout(r,250));
  }
  setStatus('Your prompt is ready, but automatic sending was unavailable. Click Send in ChatGPT.');
})();
