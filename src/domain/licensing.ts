/**
 * Gemini Enterprise licensing (licenseConfigs / userLicenses).
 * Tier labels follow the SubscriptionTier enumDescriptions of the v1alpha Discovery Document (2026-10-25).
 */
const TIER_LABELS: Record<string, string> = {
  SUBSCRIPTION_TIER_SEARCH: 'Search',
  SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT: 'Gemini Enterprise Plus',
  SUBSCRIPTION_TIER_NOTEBOOK_LM: 'NotebookLM',
  SUBSCRIPTION_TIER_FRONTLINE_WORKER: 'Gemini Frontline Worker',
  SUBSCRIPTION_TIER_AGENTSPACE_STARTER: 'Gemini Business Starter',
  SUBSCRIPTION_TIER_AGENTSPACE_BUSINESS: 'Gemini Business',
  SUBSCRIPTION_TIER_ENTERPRISE: 'Gemini Enterprise Standard',
  SUBSCRIPTION_TIER_ENTERPRISE_EMERGING: 'Gemini Enterprise Standard (emerging markets)',
  SUBSCRIPTION_TIER_EDU: 'Gemini Enterprise EDU',
  SUBSCRIPTION_TIER_EDU_PRO: 'Gemini Enterprise EDU Pro',
  SUBSCRIPTION_TIER_EDU_EMERGING: 'Gemini Enterprise EDU (emerging markets)',
  SUBSCRIPTION_TIER_EDU_PRO_EMERGING: 'Gemini Enterprise EDU Pro (emerging markets)',
  SUBSCRIPTION_TIER_FRONTLINE_STARTER: 'Gemini Frontline Starter',
  SUBSCRIPTION_TIER_CONSUMPTION_ONLY: 'Gemini Enterprise Consumption-only (PAYG)',
  SUBSCRIPTION_TIER_EDU_GOV_EMERGING: 'Gemini Enterprise EDU Government (emerging markets)'
};

export function tierLabel(tier: string | undefined): string {
  return (tier && TIER_LABELS[tier]) || tier || 'UNKNOWN';
}

const lastSegment = (name: string | undefined) => (name ? name.split('/').pop() || '' : '');

export function selectLicenseConfigId(configs: any[], requestedId?: string): string {
  if (requestedId) {
    const match = configs.find(c => lastSegment(c.name) === requestedId);
    if (!match) throw new Error(`License configuration "${requestedId}" not found.`);
    if (match.state !== 'ACTIVE') throw new Error(`License configuration "${requestedId}" is not active (state: ${match.state}).`);
    return requestedId;
  }
  const active = configs.filter(c => c.state === 'ACTIVE');
  if (active.length === 0) throw new Error('No active license configuration found in this project.');
  if (active.length > 1) {
    // Picking one silently could assign the wrong tier, so require an explicit choice.
    const options = active.map(c => `${lastSegment(c.name)} (${tierLabel(c.subscriptionTier)})`).join(', ');
    throw new Error(`Multiple active license configurations found; pass subscription_id explicitly. Options: ${options}`);
  }
  return lastSegment(active[0].name);
}

const formatDate = (d: any) =>
  d && d.year ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : '';

export function summarizeSubscriptions(licenseConfigs: any[], userLicenses: any[]) {
  return licenseConfigs.map(lc => {
    const subscriptionId = lastSegment(lc.name);
    const totalLicenses = parseInt(lc.licenseCount, 10) || 0;
    const assigned = userLicenses.filter(ul =>
      lastSegment(ul.licenseConfig) === subscriptionId && ul.licenseAssignmentState === 'ASSIGNED').length;
    const end = formatDate(lc.endDate);
    return {
      subscriptionId,
      state: lc.state,
      tier: tierLabel(lc.subscriptionTier),
      subscriptionTier: lc.subscriptionTier,
      totalLicenses,
      assigned,
      free: Math.max(0, totalLicenses - assigned),
      termStartDate: formatDate(lc.startDate),
      termEndDate: end,
      autoRenew: Boolean(lc.autoRenew)
    };
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmails(usernames: unknown): string[] {
  if (!Array.isArray(usernames) || usernames.length === 0) {
    throw new Error('usernames must be a non-empty array of user email addresses.');
  }
  for (const u of usernames) {
    if (typeof u !== 'string' || !EMAIL.test(u)) throw new Error(`Invalid email address: ${String(u)}`);
  }
  return usernames as string[];
}
