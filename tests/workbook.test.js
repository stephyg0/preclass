import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeWorkbookResults,workbookPrompt} from '../extension/workbook.js';
const doc=(numbers,total)=>({result:{title:'Workbook',course:'CS142',url:'https://example.com/workbook',frames:[],workbookLinks:[],questions:numbers.map(number=>({number,total,text:'Question '+number+' of '+total})),text:'Question content',oversized:false}});
test('requires every numbered question',()=>{
 assert.equal(mergeWorkbookResults([doc([1,2,3],3)]).complete,true);
 assert.equal(mergeWorkbookResults([doc([1,3],3)]).complete,false);
 assert.equal(mergeWorkbookResults([doc([1,1],2)]).complete,false);
});
test('never combines separate workbooks to claim completeness',()=>{
 assert.equal(mergeWorkbookResults([doc([1],2),doc([2],2)]).complete,false);
});
test('workbook prompt preserves questions and requests ordered answers',()=>{
 const prompt=workbookPrompt(mergeWorkbookResults([doc([1,2],2)]));
 assert.match(prompt,/ALL 2 WORKBOOK QUESTIONS/);
 assert.match(prompt,/original order/);
 assert.match(prompt,/Question content/);
});
