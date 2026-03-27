import Anthropic from '@anthropic-ai/sdk';
import { getEnvValue } from './envHelper';

export interface GenerationContext {
  businessName: string;
  domain: string;
  phone: string | null;
  pageType: string;
  existingAnalysis: { requirements?: Array<{ status: string; label: string; suggestion?: string; evidence?: string }> } | null;
}

const PAGE_TEMPLATES: Record<string, string> = {

  contact: `Generate a complete Contact page for a restoration company website.
Include:
- Company name prominently displayed
- Full physical address (use a placeholder: [STREET ADDRESS], [CITY], [STATE] [ZIP])
- Phone number: {phone}
- Email: info@{domain}
- Business hours placeholder: Monday-Friday 8AM-5PM, Emergency services available 24/7
- A contact form description (Name, Email, Phone, Message fields)
- Emergency contact callout for water/fire/mold damage
- Google Maps embed placeholder

Write in clean Markdown. Use ## headings. Professional but approachable tone.
This is for {businessName}.`,

  privacy_policy: `Generate a complete Privacy Policy page for a restoration company that sends SMS/text messages to customers.

CRITICAL A2P/10DLC REQUIREMENTS — the policy MUST include ALL of these:
1. What personal data is collected (name, email, phone number, address, service details)
2. HOW data is used — specifically mention SMS/text messaging
3. SMS-specific data collection language: "We collect your phone number to send you text messages regarding your service requests, appointment confirmations, and updates"
4. SMS consent language: "By providing your phone number, you consent to receive text messages from {businessName}. Consent is not a condition of purchase."
5. Opt-out instructions: "You may opt out of text messages at any time by replying STOP"
6. Third-party sharing disclosure
7. Data retention statement
8. COPPA statement (not collecting data from children under 13)
9. Contact information for privacy inquiries: privacy@{domain}
10. Effective/last updated date: [EFFECTIVE DATE]

Write in clean Markdown with ## section headings.
Legal but readable. Reference {businessName} by name.
Include the domain {domain} where appropriate.`,

  terms_of_service: `Generate complete Terms of Service for a restoration company website with SMS/text messaging capabilities.

CRITICAL A2P/10DLC REQUIREMENTS — the terms MUST include:
1. Acceptance of terms clause
2. A DEDICATED "SMS/Text Messaging Terms" section with:
   a. Consent clause: "By providing your phone number, you agree to receive text messages from {businessName}"
   b. Message frequency: "You may receive up to [4] messages per month"
   c. Opt-out: "Reply STOP to cancel. Reply HELP for help."
   d. Message and data rates disclaimer: "Message and data rates may apply"
   e. Carrier liability disclaimer
3. Limitation of liability
4. Right to modify terms
5. Governing law (placeholder: [STATE])

Write in clean Markdown with ## section headings.
Legal but readable. Reference {businessName} by name.`,

  sms_policy: `Generate a complete SMS/Text Messaging Policy page for a restoration company.

This page is CRITICAL for A2P/10DLC registration. It MUST include ALL of these:
1. Program name: "{businessName} Text Alerts" (or similar)
2. Program description: what messages the customer will receive (appointment confirmations, service updates, emergency notifications, promotional offers)
3. Opt-in mechanism: "By texting [KEYWORD] to [SHORT CODE/NUMBER] or by providing your phone number on our website, you consent to receive text messages from {businessName}"
4. Opt-out: "Text STOP to [NUMBER] to opt out at any time. You will receive a confirmation message."
5. Help: "Text HELP to [NUMBER] for assistance, or contact us at {phone} or support@{domain}"
6. Message frequency: "Message frequency varies. You may receive up to [4] messages per month."
7. Message and data rates: "Message and data rates may apply. Check with your carrier."
8. Carrier disclaimer: "Carriers are not liable for delayed or undelivered messages"
9. Privacy policy link: "View our privacy policy at https://{domain}/privacy-policy"
10. Terms of service link: "View our terms at https://{domain}/terms-of-service"
11. Contact information: {businessName}, {phone}, support@{domain}
12. No consent sharing: "We do not share your opt-in consent or phone number with third parties for marketing purposes"

Write in clean Markdown with ## section headings.
Clear, concise, compliant. Reference {businessName} by name.`,
};

export async function generateA2PContent(context: GenerationContext): Promise<string> {
  const apiKey = getEnvValue('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const template = PAGE_TEMPLATES[context.pageType];
  if (!template) throw new Error(`No template for page type: ${context.pageType}`);

  const prompt = template
    .replace(/\{businessName\}/g, context.businessName || '[BUSINESS NAME]')
    .replace(/\{domain\}/g, context.domain || '[DOMAIN]')
    .replace(/\{phone\}/g, context.phone || '[PHONE NUMBER]');

  let contextNote = '';
  if (context.existingAnalysis?.requirements) {
    const failures = context.existingAnalysis.requirements
      .filter(r => r.status === 'fail')
      .map(r => `- ${r.label}: ${r.suggestion || r.evidence}`)
      .join('\n');

    if (failures) {
      contextNote = `\n\nNOTE: The existing page was analyzed and failed these specific checks. Make sure the generated content addresses each one:\n${failures}`;
    }
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `${prompt}${contextNote}\n\nRespond ONLY with the Markdown content. No preamble, no explanation — just the page content.`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return text.trim();
}
