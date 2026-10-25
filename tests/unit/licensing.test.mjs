import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierLabel, selectLicenseConfigId, summarizeSubscriptions, validateEmails } from '../../build/domain/licensing.js';

const cfg = (id, state, tier = 'SUBSCRIPTION_TIER_ENTERPRISE', licenseCount = '10') =>
  ({ name: `projects/p/locations/global/licenseConfigs/${id}`, state, subscriptionTier: tier, licenseCount });

test('tier labels follow the official enum descriptions; unknown tiers are not guessed', () => {
  assert.equal(tierLabel('SUBSCRIPTION_TIER_ENTERPRISE'), 'Gemini Enterprise Standard');
  assert.equal(tierLabel('SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT'), 'Gemini Enterprise Plus');
  assert.equal(tierLabel('SUBSCRIPTION_TIER_CONSUMPTION_ONLY'), 'Gemini Enterprise Consumption-only (PAYG)');
  assert.equal(tierLabel('SUBSCRIPTION_TIER_FUTURE'), 'SUBSCRIPTION_TIER_FUTURE');
});

test('explicit subscription id must exist and be active', () => {
  assert.equal(selectLicenseConfigId([cfg('a', 'ACTIVE')], 'a'), 'a');
  assert.throws(() => selectLicenseConfigId([cfg('a', 'EXPIRED')], 'a'), /not active/);
  assert.throws(() => selectLicenseConfigId([cfg('a', 'ACTIVE')], 'zzz'), /not found/);
});

test('auto-selection only when exactly one active config exists', () => {
  assert.equal(selectLicenseConfigId([cfg('a', 'ACTIVE'), cfg('b', 'EXPIRED')]), 'a');
  assert.throws(() => selectLicenseConfigId([cfg('a', 'ACTIVE'), cfg('b', 'ACTIVE')]), /subscription_id/);
  assert.throws(() => selectLicenseConfigId([]), /No active license configuration/);
});

test('subscription summary counts assigned seats per config', () => {
  const summary = summarizeSubscriptions([cfg('a', 'ACTIVE')], [
    { licenseConfig: 'projects/p/locations/global/licenseConfigs/a', licenseAssignmentState: 'ASSIGNED' },
    { licenseConfig: 'projects/p/locations/global/licenseConfigs/a', licenseAssignmentState: 'UNASSIGNED' }
  ]);
  assert.equal(summary[0].assigned, 1);
  assert.equal(summary[0].free, 9);
  assert.equal(summary[0].tier, 'Gemini Enterprise Standard');
});

test('emails are validated', () => {
  assert.deepEqual(validateEmails(['a@b.com']), ['a@b.com']);
  assert.throws(() => validateEmails([]), /usernames/);
  assert.throws(() => validateEmails(['not-an-email']), /Invalid email/);
});
