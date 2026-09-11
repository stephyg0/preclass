(async () => {
  const item = await chrome.runtime.sendMessage({type:'take'});
  if (!item?.prompt) return;
  const host=document.createElement('div');
  host.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483647';
  const shadow=host.attachShadow({mode:'closed'});
  const box=document.createElement('section');
  box.style.cssText='background:#f7f5ee;color:#193e31;padding:18px;border:1px solid #c8d5c9;border-radius:16px;font:14px system-ui;width:300px;box-shadow:0 8px 40px #0003';
  const status=document.createElement('p');status.textContent='✦ Preclass · Looking for the composer…';
  const copy=document.createElement('button');copy.textContent='Copy prompt';
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(item.prompt);status.textContent='Copied. Paste into your chat and click Send.';}catch{fallback.hidden=false;fallback.select();status.textContent='Select the prompt below and copy it manually.';}};
  const fallback=document.createElement('textarea'); fallback.value=item.prompt;fallback.hidden=true;fallback.setAttribute('aria-label','Preclass prompt');fallback.style.cssText='width:100%;height:150px;margin-top:12px';
  const close=document.createElement('button');close.textContent='Dismiss';close.style.marginLeft='10px';close.onclick=()=>{chrome.runtime.sendMessage({type:'done'});host.remove();};
  box.append(status,copy,close,fallback);shadow.append(box);document.body.append(host);
  let filled=false;
  for(let attempt=0;attempt<60;attempt++) {
    const editor=document.querySelector('#prompt-textarea[contenteditable="true"], textarea#prompt-textarea, textarea[data-testid="prompt-textarea"]');
    if(editor && editor.getClientRects().length) {
      if ((editor.value ?? editor.innerText).trim()) {status.textContent='Your composer already has a draft. Copy this prompt when you’re ready.';return;}
      editor.focus();
      if(editor.tagName==='TEXTAREA') {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,item.prompt);
        editor.dispatchEvent(new Event('input',{bubbles:true}));
      } else {
        document.execCommand('insertText',false,item.prompt);
      }
      filled=(editor.value ?? editor.innerText).replace(/\r/g,'').trim() === item.prompt.replace(/\r/g,'').trim();
      break;
    }
    await new Promise(r=>setTimeout(r,500));
  }
  status.textContent=filled ? '✦ Preclass is ready. Review the draft, then click Send.' : 'Open a chat in this project, then copy and paste your prompt.';
  if(filled) await chrome.runtime.sendMessage({type:'done'});
})();
