export function googleSearchURL(title) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(title);
}
export function readingKeywords(title) {
  const work = title.replace(/^.*?\((?:19|20)\d{2}[^)]*\)\.?\s*/, '');
  return [...new Set(work.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].filter(w=>!['the','and','for','with','from','www','com','https'].includes(w));
}
export function parseGoogleResults(html, title) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (/unusual traffic|not a robot|before you continue to google/i.test(doc.body.textContent)) {
    return {state:'blocked', candidates:[], message:'Google requires a browser check. Open the search and choose the source manually.'};
  }
  const keywords=readingKeywords(title), seen=new Set(), candidates=[];
  for (const heading of doc.querySelectorAll('h3')) {
    const anchor=heading.closest('a[href]');
    if(!anchor)continue;
    let url;
    try {
      url=new URL(anchor.getAttribute('href'),'https://www.google.com');
      if(url.pathname==='/url' && url.hostname==='www.google.com')url=new URL(url.searchParams.get('q') || url.searchParams.get('url'));
    } catch {continue;}
    if(!['http:','https:'].includes(url.protocol) || /(^|\.)google\.com$/.test(url.hostname) || seen.has(url.href))continue;
    seen.add(url.href);
    const resultTitle=heading.textContent.trim();
    const tokens=new Set(readingKeywords(resultTitle));
    const score=keywords.length ? keywords.filter(w=>tokens.has(w)).length/keywords.length : 0;
    if(score>=0.6 && keywords.filter(w=>tokens.has(w)).length>=2)candidates.push({title:resultTitle,url:url.href,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates.length ? {state:'candidates',candidates:candidates.slice(0,3),message:'Possible matches found. Confirm the title, author, and edition before using one.'} :
    {state:'not-found',candidates:[],message:'No reliable match found. Open Google search or supply the source manually.'};
}
