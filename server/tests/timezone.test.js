import assert from 'node:assert/strict';
import { normalizeTime, normalizeDueDate, getValidTimezone, getTimezoneDayBoundaries } from '../src/utils/timezone.js';

console.log('\n================================================================');
console.log('   TaskMate Timezone & Due Time Normalization Test Suite         ');
console.log('================================================================\n');

// 1. normalizeTime unit tests
console.log('--- TEST GROUP 1: normalizeTime ---');

assert.equal(normalizeTime('14:30'), '14:30', 'Standard 24h format preserved');
console.log('[PASS] normalizeTime("14:30") => "14:30"');

assert.equal(normalizeTime('9:30'), '09:30', 'Single-digit hour padded with leading 0');
console.log('[PASS] normalizeTime("9:30") => "09:30"');

assert.equal(normalizeTime('09:30'), '09:30', 'Standard morning 24h format preserved');
console.log('[PASS] normalizeTime("09:30") => "09:30"');

assert.equal(normalizeTime('14:30:00'), '14:30', 'Timestamp with seconds stripped to HH:mm');
console.log('[PASS] normalizeTime("14:30:00") => "14:30"');

assert.equal(normalizeTime('5:30 PM'), '17:30', '12h PM format converted to 24h');
console.log('[PASS] normalizeTime("5:30 PM") => "17:30"');

assert.equal(normalizeTime('5:30 pm'), '17:30', '12h pm lowercase converted to 24h');
console.log('[PASS] normalizeTime("5:30 pm") => "17:30"');

assert.equal(normalizeTime('5:30 AM'), '05:30', '12h AM format converted to 24h');
console.log('[PASS] normalizeTime("5:30 AM") => "05:30"');

assert.equal(normalizeTime('12:00 AM'), '00:00', '12:00 AM midnight converted to 00:00');
console.log('[PASS] normalizeTime("12:00 AM") => "00:00"');

assert.equal(normalizeTime('12:00 PM'), '12:00', '12:00 PM noon converted to 12:00');
console.log('[PASS] normalizeTime("12:00 PM") => "12:00"');

assert.equal(normalizeTime('12:45 AM'), '00:45', '12:45 AM converted to 00:45');
console.log('[PASS] normalizeTime("12:45 AM") => "00:45"');

assert.equal(normalizeTime('12:45 PM'), '12:45', '12:45 PM converted to 12:45');
console.log('[PASS] normalizeTime("12:45 PM") => "12:45"');

assert.equal(normalizeTime('9 AM'), '09:00', 'Hour-only AM converted to 09:00');
console.log('[PASS] normalizeTime("9 AM") => "09:00"');

assert.equal(normalizeTime('9 PM'), '21:00', 'Hour-only PM converted to 21:00');
console.log('[PASS] normalizeTime("9 PM") => "21:00"');

assert.equal(normalizeTime(''), null, 'Empty string returns null');
assert.equal(normalizeTime(null), null, 'null returns null');
assert.equal(normalizeTime(undefined), null, 'undefined returns null');
assert.equal(normalizeTime('invalid'), null, 'Invalid string returns null');
assert.equal(normalizeTime('25:00'), null, 'Out-of-range hour returns null');
assert.equal(normalizeTime('12:65'), null, 'Out-of-range minute returns null');
console.log('[PASS] Invalid and empty inputs safely return null');

// 2. normalizeDueDate unit tests
console.log('\n--- TEST GROUP 2: normalizeDueDate in Asia/Kolkata (UTC +05:30) ---');

// Case A: All-day task without dueTime in Asia/Kolkata
const allDayResult = normalizeDueDate('2026-11-17', 'Asia/Kolkata', null);
assert.equal(allDayResult.dueDateString, '2026-11-17');
assert.equal(allDayResult.dueTime, null);
// Local time in Asia/Kolkata must be end of day 23:59:59.999
const kolkataFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});
const kolkataTime = kolkataFormatter.format(allDayResult.dueDate);
assert.equal(kolkataTime, '23:59:59', 'Local time in Asia/Kolkata is 23:59:59 (end of day), NOT 05:29:59!');
console.log('[PASS] All-day task calculates local end-of-day: local time in Asia/Kolkata is 23:59:59, not 05:29 AM!');

// Case B: Task with explicit dueTime "15:00" in Asia/Kolkata
const specificTimeResult = normalizeDueDate('2026-11-17', 'Asia/Kolkata', '15:00');
assert.equal(specificTimeResult.dueDateString, '2026-11-17');
assert.equal(specificTimeResult.dueTime, '15:00');
const kolkataSpecificTime = kolkataFormatter.format(specificTimeResult.dueDate);
assert.equal(kolkataSpecificTime, '15:00:00', 'Local time matches exact due time 15:00');
console.log('[PASS] Task with "15:00" dueTime correctly translates to 15:00 in Asia/Kolkata');

// Case C: Task with 12h format "3:30 PM"
const pmResult = normalizeDueDate('2026-11-17', 'Asia/Kolkata', '3:30 PM');
assert.equal(pmResult.dueDateString, '2026-11-17');
assert.equal(pmResult.dueTime, '15:30');
const kolkataPmTime = kolkataFormatter.format(pmResult.dueDate);
assert.equal(kolkataPmTime, '15:30:00', '12h PM time accurately normalized and converted');
console.log('[PASS] Task with "3:30 PM" normalized to 15:30 in Asia/Kolkata');

// Case D: Task with single digit hour "9:15"
const singleDigitResult = normalizeDueDate('2026-11-17', 'Asia/Kolkata', '9:15');
assert.equal(singleDigitResult.dueDateString, '2026-11-17');
assert.equal(singleDigitResult.dueTime, '09:15');
const kolkataSingleDigitTime = kolkataFormatter.format(singleDigitResult.dueDate);
assert.equal(kolkataSingleDigitTime, '09:15:00', 'Single digit hour normalized to 09:15');
console.log('[PASS] Task with "9:15" normalized to 09:15 in Asia/Kolkata');

console.log('\n================================================================');
console.log(' All Timezone and Due Time Tests Passed Successfully!');
console.log('================================================================\n');
