import test from 'node:test';
import assert from 'node:assert/strict';
import {destination,promptFor} from '../extension/core.js';
const data={course:'CS142',title:'Induction',url:'https://forum.minerva.edu/session',text:'Read chapter 3',links:[{title:'Book',url:'https://example.com/a.pdf',pdf:true,context:'Chapter 3'}],questions:['Why does induction work?']};
test('allows only HTTPS ChatGPT destinations',()=>{
 for(const url of ['http://chatgpt.com','https://chatgpt.com.evil.test','javascript:alert(1)','https://user@chatgpt.com','https://chatgpt.com:8080'])assert.throws(()=>destination(url));
 assert.equal(destination('https://chatgpt.com/c/abc#foo'),'https://chatgpt.com/c/abc');
 assert.equal(destination(''),'https://chatgpt.com/');
});
test('preserves assignments, source attribution and questions',()=>{const p=promptFor(data,{context:true});for(const text of ['Chapter 3','[PDF]','Why does induction work?','https://example.com/a.pdf','Do not invent prior context','Never imply you read'])assert.ok(p.includes(text));});
test('respects prompt switches',()=>{const p=promptFor(data,{instructions:false,notes:false,context:false});assert.ok(!p.includes('Read chapter 3'));assert.ok(!p.includes('Organize notes'));assert.ok(!p.includes('Connect to previous'));assert.ok(p.includes('Why does induction work?'));});
test('does not invent missing resources',()=>{const p=promptFor({...data,links:[],questions:[]});assert.ok(p.includes('No reading links detected'));assert.ok(p.includes('None detected'));});
