export const SLA_DEFINITION = {
  title: 'Communication SLA',
  summary:
    'Every client-tagged contact must receive at least one outbound message (SMS, email, call, etc.) within a rolling 7-day window.',
  thresholds: [
    {
      status: 'ok' as const,
      color: 'green',
      emoji: '\u{1F7E2}',
      label: 'On Track',
      rule: '5 days or fewer since last outbound',
      description: 'Contact has been reached recently. No action needed.',
    },
    {
      status: 'warning' as const,
      color: 'amber',
      emoji: '\u{1F7E1}',
      label: 'Approaching Deadline',
      rule: '6\u20137 days since last outbound',
      description: 'Contact is approaching the 7-day window. Reach out soon.',
    },
    {
      status: 'violation' as const,
      color: 'red',
      emoji: '\u{1F534}',
      label: 'Overdue',
      rule: 'More than 7 days or never contacted',
      description: 'Contact has not been reached within the required window. Action required immediately.',
    },
  ],
  companyRollup:
    "A company's SLA status is the worst status of any client-tagged contact under that sub-account. If even one contact is overdue, the company shows red.",
  dataSource:
    'SLA is calculated from outbound messages synced from GHL conversations. Only outbound direction counts \u2014 inbound messages from the client do not reset the timer.',
};
