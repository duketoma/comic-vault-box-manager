import assert from 'node:assert/strict';
import { TIER_LIMITS, getNextUtcMidnightIso } from '../middleware/quota';

async function runTests() {
  console.log('Running Quota Engine Unit Tests...\n');

  // Test 1: Tier limits definitions
  assert.equal(TIER_LIMITS.free.dailyReads, 100);
  assert.equal(TIER_LIMITS.free.dailyWrites, 50);
  assert.equal(TIER_LIMITS.collector.dailyReads, 1000);
  assert.equal(TIER_LIMITS.collector.dailyWrites, 500);
  assert.equal(TIER_LIMITS.archivist.dailyWrites, Infinity);
  console.log('✓ Test 1 Passed: Tier limits match specifications.');

  // Test 2: UTC midnight calculation
  const fixedDate = new Date('2026-11-10T15:30:00.000Z');
  const nextMidnight = getNextUtcMidnightIso(fixedDate);
  assert.equal(nextMidnight, '2026-11-11T00:00:00.000Z');
  console.log('✓ Test 2 Passed: UTC midnight reset calculated correctly.');

  console.log('\nAll Quota Engine tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
