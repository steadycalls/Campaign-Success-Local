/**
 * SLA computation logic — shared between local Electron app and cloud Worker.
 *
 * This is the single source of truth for how SLA status is computed.
 * Both platforms import from here to ensure consistent behavior.
 */

import type { SLAStatus, SLAConfig } from './types';

export const DEFAULT_SLA_CONFIG: SLAConfig = {
  warningDays: 5,
  violationDays: 7,
};

/**
 * Compute SLA status for a single contact.
 */
export function computeContactSLA(
  daysSinceOutbound: number,
  hasOutbound: boolean,
  config: SLAConfig = DEFAULT_SLA_CONFIG,
): SLAStatus {
  if (!hasOutbound) return 'violation';
  if (daysSinceOutbound > config.violationDays) return 'violation';
  if (daysSinceOutbound > config.warningDays) return 'warning';
  return 'ok';
}

/**
 * Compute company-level SLA status from an array of client contacts.
 * Returns the worst status across all client-tagged contacts.
 */
export function computeCompanySLAFromContacts(
  contacts: Array<{ sla_status: SLAStatus; days_since_outbound: number }>,
): { status: SLAStatus; daysSinceContact: number } {
  if (contacts.length === 0) return { status: 'ok', daysSinceContact: 0 };

  let worstStatus: SLAStatus = 'ok';
  let maxDays = 0;

  for (const c of contacts) {
    if (c.days_since_outbound > maxDays) maxDays = c.days_since_outbound;
    if (c.sla_status === 'violation') worstStatus = 'violation';
    else if (c.sla_status === 'warning' && worstStatus !== 'violation') worstStatus = 'warning';
  }

  return { status: worstStatus, daysSinceContact: maxDays };
}
