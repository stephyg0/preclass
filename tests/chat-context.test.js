import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationURL,studyContextKey,workbookDestination} from '../extension/chat-context.js';
test('workbook sends directly to the supplied ChatGPT link',()=>{
 assert.equal(workbookDestination('https://chatgpt.com/g/g-p-course/project'),'https://chatgpt.com/g/g-p-course/project');
 assert.equal(workbookDestination('https://chatgpt.com/c/existing'),'https://chatgpt.com/c/existing');
 assert.throws(()=>workbookDestination('https://example.com/c/guide'));
});
test('context is scoped to course and pre-class page',()=>{
 assert.equal(studyContextKey('cs142','https://forum.minerva.edu/session?a=1'),studyContextKey('CS142','https://forum.minerva.edu/session?a=2'));
 assert.notEqual(studyContextKey('CS142','https://forum.minerva.edu/session1'),studyContextKey('CS142','https://forum.minerva.edu/session2'));
 assert.throws(()=>conversationURL('https://example.com/c/guide'));
});
