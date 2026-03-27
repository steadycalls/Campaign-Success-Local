export interface ComplianceRequirement {
  id: string;
  label: string;
  description: string;
  required: boolean;
  weight: number;
}

export const A2P_REQUIREMENTS: Record<string, ComplianceRequirement[]> = {

  contact: [
    { id: 'c_business_name',  label: 'Business Name',        description: 'Legal business name visible on the page',                     required: true,  weight: 10 },
    { id: 'c_address',        label: 'Physical Address',      description: 'Physical business address (street, city, state, zip)',          required: true,  weight: 10 },
    { id: 'c_phone',          label: 'Phone Number',          description: 'Business phone number',                                       required: true,  weight: 10 },
    { id: 'c_email',          label: 'Email Address',         description: 'Business email address or contact form',                       required: true,  weight: 8 },
    { id: 'c_contact_form',   label: 'Contact Form',          description: 'A working contact form or clear call-to-action',               required: false, weight: 5 },
    { id: 'c_hours',          label: 'Business Hours',        description: 'Hours of operation listed',                                    required: false, weight: 3 },
  ],

  privacy_policy: [
    { id: 'pp_data_collection',    label: 'Data Collection Disclosure',    description: 'States what personal data is collected (name, phone, email, etc.)',              required: true,  weight: 10 },
    { id: 'pp_data_usage',         label: 'Data Usage Disclosure',         description: 'Explains how collected data is used',                                            required: true,  weight: 10 },
    { id: 'pp_third_party',        label: 'Third-Party Sharing',           description: 'Discloses whether data is shared with third parties',                             required: true,  weight: 8 },
    { id: 'pp_sms_data',           label: 'SMS-Specific Data Language',    description: 'Specifically mentions collection of phone numbers for SMS/text messaging',        required: true,  weight: 10 },
    { id: 'pp_sms_consent',        label: 'SMS Consent Language',          description: 'Describes how SMS consent is obtained and what it covers',                        required: true,  weight: 10 },
    { id: 'pp_opt_out',            label: 'Opt-Out Instructions',          description: 'Explains how users can opt out of data collection or SMS',                        required: true,  weight: 9 },
    { id: 'pp_data_retention',     label: 'Data Retention Policy',         description: 'States how long data is retained',                                               required: false, weight: 5 },
    { id: 'pp_children',           label: "Children's Privacy (COPPA)",    description: 'Statement about not knowingly collecting data from children under 13',            required: false, weight: 4 },
    { id: 'pp_contact_info',       label: 'Privacy Contact Info',          description: 'Contact info for privacy-related questions',                                      required: true,  weight: 7 },
    { id: 'pp_effective_date',     label: 'Effective Date',                description: 'Date the policy was last updated',                                                required: true,  weight: 6 },
  ],

  terms_of_service: [
    { id: 'tos_acceptance',        label: 'Acceptance of Terms',           description: 'Statement that using the service constitutes acceptance of terms',                required: true,  weight: 8 },
    { id: 'tos_sms_section',       label: 'SMS/Text Messaging Section',   description: 'Dedicated section covering SMS/text message terms',                               required: true,  weight: 10 },
    { id: 'tos_sms_consent',       label: 'SMS Consent Clause',           description: 'States that users consent to receive SMS by providing phone number',              required: true,  weight: 10 },
    { id: 'tos_sms_frequency',     label: 'Message Frequency',            description: 'Describes expected frequency of messages (e.g., "up to X msgs/month")',           required: true,  weight: 9 },
    { id: 'tos_sms_optout',        label: 'SMS Opt-Out',                  description: 'Instructions for opting out (e.g., "Reply STOP to unsubscribe")',                 required: true,  weight: 10 },
    { id: 'tos_sms_rates',         label: 'Message & Data Rates',         description: 'Statement that message and data rates may apply',                                 required: true,  weight: 8 },
    { id: 'tos_liability',         label: 'Limitation of Liability',      description: 'Standard limitation of liability clause',                                         required: false, weight: 5 },
    { id: 'tos_modifications',     label: 'Right to Modify',              description: 'Statement that terms may be updated',                                             required: true,  weight: 6 },
    { id: 'tos_governing_law',     label: 'Governing Law',                description: 'Jurisdiction/governing law specified',                                            required: false, weight: 4 },
  ],

  sms_policy: [
    { id: 'sms_program_name',      label: 'Program Name',                 description: 'Name of the SMS program or messaging campaign',                                  required: true,  weight: 10 },
    { id: 'sms_program_desc',      label: 'Program Description',          description: 'Description of what messages the user will receive',                              required: true,  weight: 10 },
    { id: 'sms_opt_in',            label: 'Opt-In Mechanism',             description: 'Describes how users opt in to receive messages',                                  required: true,  weight: 10 },
    { id: 'sms_opt_out',           label: 'Opt-Out Instructions',         description: 'Clear opt-out instructions (STOP, UNSUBSCRIBE, etc.)',                            required: true,  weight: 10 },
    { id: 'sms_help',              label: 'Help Instructions',            description: 'How to get help (e.g., "Reply HELP for assistance")',                             required: true,  weight: 9 },
    { id: 'sms_frequency',         label: 'Message Frequency',            description: 'Expected message frequency (e.g., "up to 4 msgs/month")',                        required: true,  weight: 10 },
    { id: 'sms_data_rates',        label: 'Message & Data Rates',         description: 'Statement that standard message and data rates may apply',                        required: true,  weight: 10 },
    { id: 'sms_carriers',          label: 'Carrier Disclaimer',           description: 'Disclaimer that carriers are not liable for delayed or undelivered messages',     required: false, weight: 6 },
    { id: 'sms_privacy_link',      label: 'Privacy Policy Link',          description: "Link to the company's privacy policy",                                            required: true,  weight: 8 },
    { id: 'sms_terms_link',        label: 'Terms of Service Link',        description: "Link to the company's terms of service",                                          required: true,  weight: 8 },
    { id: 'sms_contact',           label: 'Contact Information',          description: 'Business contact info for questions about the SMS program',                       required: true,  weight: 7 },
    { id: 'sms_no_sharing',        label: 'No Consent Sharing',           description: 'Statement that consent data is not shared with third parties',                    required: true,  weight: 9 },
  ],
};
