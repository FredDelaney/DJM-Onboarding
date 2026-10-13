import assert from 'node:assert/strict';
import test from 'node:test';
import { taskLocalInstant } from '../lib/calendar/tasks.ts';
test('task times reject gaps and overlaps rather than guessing',()=>{
 assert.throws(()=>taskLocalInstant('2026-03-29','02:30','Europe/Rome'));
 assert.throws(()=>taskLocalInstant('2026-10-25','02:30','Europe/Rome'));
 assert.equal(taskLocalInstant('2026-10-25','03:30','Europe/Rome'),'2026-10-25T02:30:00Z');
 assert.equal(taskLocalInstant('2026-10-04','09:00','Europe/Athens'),'2026-10-04T06:00:00Z');
 assert.equal(taskLocalInstant('2026-10-04','23:30','America/Los_Angeles'),'2026-10-05T06:30:00Z');
 assert.throws(()=>taskLocalInstant('2026-02-30','09:00','UTC'));
});
