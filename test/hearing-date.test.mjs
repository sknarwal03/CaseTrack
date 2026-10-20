import test from 'node:test';
import assert from 'node:assert/strict';
import { latestTrialStage } from '../assets/js/charge-date.js';

test('selects the latest hearing stage chronologically across day, month, and year boundaries', () => {
    assert.equal(latestTrialStage([
        { date: '15/12/2024', trialStage: 'Evidence' },
        { date: '02/01/2025', trialStage: 'Arguments' },
        { date: '30/12/2024', trialStage: 'Charge' }
    ]), 'Arguments');
});

test('preserves the first stage when hearings share the same date', () => {
    assert.equal(latestTrialStage([
        { date: '02/01/2025', trialStage: 'Evidence' },
        { date: '02/01/2025', trialStage: 'Arguments' }
    ]), 'Evidence');
});

test('ignores invalid or unstaged dates and returns the active stage as fallback', () => {
    assert.equal(latestTrialStage([
        { date: '31/02/2025', trialStage: 'Invalid date' },
        { date: '01/01/2025', trialStage: '  ' }
    ], 'Current stage'), 'Current stage');
});

test('compares legacy calendar dates and ISO dates chronologically', () => {
    assert.equal(latestTrialStage([
        { date: '2025-02-03', trialStage: 'Older' },
        { date: '04/02/2025', trialStage: 'Newer' }
    ]), 'Newer');
});
