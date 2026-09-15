import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationURL,studyContextKey,workbookDestination} from '../extension/chat-context.js';
test('workbook uses the recorded conversation, never the project landing page',()=>{
 assert.equal(workbookDestination({ready:true,url:'https://chatgpt.com/g/g-p-course/c/guide'},'https://chatgpt.com/g/g-p-course/project'),'https://chatgpt.com/g/g-p-course/c/guide');
 assert.throws(()=>workbookDestination(null,'https://chatgpt.com/g/g-p-course/project'));
 assert.throws(()=>workbookDestination({ready:false,url:'https://chatgpt.com/c/guide'},'https://chatgpt.com/c/elsewhere'));
 assert.equal(workbookDestination(null,'https://chatgpt.com/c/existing'),'https://chatgpt.com/c/existing');
});
test('context is scoped to course and pre-class page',()=>{
 assert.equal(studyContextKey('cs142','https://forum.minerva.edu/session?a=1'),studyContextKey('CS142','https://forum.minerva.edu/session?a=2'));
 assert.notEqual(studyContextKey('CS142','https://forum.minerva.edu/session1'),studyContextKey('CS142','https://forum.minerva.edu/session2'));
 assert.throws(()=>conversationURL('https://example.com/c/guide'));
});
