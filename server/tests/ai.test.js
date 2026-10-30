import { parseNaturalDateTime, parseTaskSchedulePrompt, generateTaskBreakdown } from '../src/services/aiService.js';

console.log('================================================================');
console.log('   TaskFlow AI Assistant & Scheduling Engine Verification Suite ');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, testName, extraInfo = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName} ${extraInfo ? '- ' + extraInfo : ''}`);
    failed++;
  }
}

// 1. Natural date & time parsing
const tomorrowParsed = parseNaturalDateTime('Schedule review tomorrow at 3pm');
assert(tomorrowParsed !== null, '1. Natural date parsed for "tomorrow at 3pm"');
assert(tomorrowParsed && tomorrowParsed.hasTime === true, '2. Detected explicit time in "tomorrow at 3pm"');

const inDaysParsed = parseNaturalDateTime('Deliver package in 3 days');
assert(inDaysParsed !== null, '3. Natural relative date parsed for "in 3 days"');

// 2. Full Task Prompt Parsing
const complexPrompt = 'Schedule urgent client presentation tomorrow at 10:30am under Work with subtasks prepare slides, send invite, review agenda';
const parsedTask = parseTaskSchedulePrompt(complexPrompt);

assert(parsedTask.priority === 'high', '4. Priority correctly inferred as "high" for urgent prompt');
assert(parsedTask.category === 'Work', '5. Category correctly inferred as "Work"');
assert(parsedTask.dueDateString !== null, '6. Due date string generated properly');
assert(parsedTask.subtasks.length === 3, '7. Subtasks parsed correctly (expected 3, got ' + parsedTask.subtasks.length + ')');
assert(parsedTask.title.toLowerCase().includes('client presentation'), '8. Title cleaned and extracted correctly: ' + parsedTask.title);

// 3. Recurrence Detection
const recurringPrompt = 'Team standup every Monday at 9am';
const recTask = parseTaskSchedulePrompt(recurringPrompt);
assert(recTask.recurrence.isRecurring === true, '9. Recurring flag detected');
assert(recTask.recurrence.frequency === 'weekly', '10. Recurrence frequency inferred as weekly');

// 4. Project Breakdown Milestone Generation
const milestones = generateTaskBreakdown('Launch mobile app beta');
assert(Array.isArray(milestones) && milestones.length >= 4, '11. Generated 4+ structured milestones for product launch');
assert(milestones[0].dueDateString !== null, '12. Milestones have sequenced calendar due dates');

console.log(`\n================================================================`);
console.log(` AI Verification Suite: ${passed} passed, ${failed} failed.`);
console.log(`================================================================\n`);

if (failed > 0) process.exit(1);
