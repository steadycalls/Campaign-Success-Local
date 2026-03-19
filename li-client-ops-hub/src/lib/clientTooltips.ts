export const CLIENT_COLUMN_TOOLTIPS: Record<string, string> = {
  client:
    'Contact name from the Restoration Inbound GHL sub-account. First + last name as stored in GHL.',
  last_contact:
    'Date of the most recent outbound message (SMS, email, etc.) sent TO this contact. Synced from GHL conversation messages.',
  days:
    'Days since last outbound contact. Used to calculate SLA status. If blank, no outbound messages have been synced yet.',
  sla:
    'Communication SLA status. Green (≤5 days since contact), Yellow (6-7 days — approaching deadline), Red (>7 days — overdue). Every client-tagged contact should receive outbound communication at least every 7 days.',
  sub_account:
    'Links this client contact to a sub-account from the portfolio. Used to connect the client\'s business to their GHL sub-account for unified reporting. Multiple contacts can link to the same sub-account.',
  teamwork:
    'Links this client contact to a Teamwork project. Shows project name and budget status. Set from here or from Settings > Teamwork.',
  discord:
    'Links this client contact to a Discord channel. Shows channel name. Set from here or from Settings > Discord.',
  readai:
    'Read.ai meeting association. Shows how many meetings match this client\'s email(s). Supports multiple emails — clients often join from different addresses. Set the email(s) to auto-match meetings.',
  email:
    'Primary email address from the GHL contact record. Also used as the default for Read.ai meeting matching.',
};

export const PORTFOLIO_COLUMN_TOOLTIPS: Record<string, string> = {
  name:
    'GHL sub-account name. Click to view company detail.',
  sla:
    'Worst SLA status across all client-tagged contacts in this sub-account. Green (≤5d), Yellow (6-7d), Red (>7d since last outbound contact).',
  contacts:
    'Contacts synced locally / total contacts in GHL. Progress bar shows sync completion percentage.',
  new_contacts:
    'New contacts added to this sub-account in the selected time period. An indicator of lead velocity and client success.',
  messages:
    'Total messages stored locally for this sub-account. Includes all inbound and outbound messages across all synced contacts.',
  budget:
    'Teamwork project budget utilization. Green (<75%), Amber (75-90%), Red (>90%).',
  last_sync:
    'When data was last synced from GHL for this sub-account.',
};
