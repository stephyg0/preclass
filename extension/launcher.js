(() => {
  if (document.getElementById('preclass-launcher')) return;
  const host=document.createElement('div'); host.id='preclass-launcher';
  const shadow=host.attachShadow({mode:'closed'});
  const button=document.createElement('button'); button.textContent='✦ Preclass';
  button.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483647;border:0;border-radius:50px;padding:15px 23px;background:#214c3d;color:white;font:600 15px system-ui;box-shadow:0 5px 25px #0003;cursor:pointer';
  button.onclick=()=>chrome.runtime.sendMessage({type:'open-panel'});
  shadow.append(button);document.body.append(host);
})();
