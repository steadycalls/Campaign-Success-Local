export interface PageTypeConfig {
  type: string;
  label: string;
  variants: string[];
  linkTextPatterns: string[];
  metaPatterns: string[];
}

export const A2P_PAGE_CONFIGS: PageTypeConfig[] = [
  {
    type: 'contact',
    label: 'Contact Page',
    variants: [
      '/contact',
      '/contact-us',
      '/contact-us/',
      '/contactus',
      '/get-in-touch',
      '/reach-us',
      '/connect',
      '/about/contact',
      '/about-us/contact',
      '/locations',
    ],
    linkTextPatterns: [
      'contact us',
      'contact',
      'get in touch',
      'reach us',
      'talk to us',
    ],
    metaPatterns: ['contact', 'get in touch', 'reach us'],
  },
  {
    type: 'privacy_policy',
    label: 'Privacy Policy',
    variants: [
      '/privacy-policy',
      '/privacy',
      '/privacy-policy/',
      '/privacypolicy',
      '/pp',
      '/legal/privacy',
      '/legal/privacy-policy',
      '/policies/privacy',
    ],
    linkTextPatterns: [
      'privacy policy',
      'privacy',
      'data policy',
      'data privacy',
    ],
    metaPatterns: ['privacy policy', 'privacy notice', 'data privacy'],
  },
  {
    type: 'terms_of_service',
    label: 'Terms of Service',
    variants: [
      '/terms-of-service',
      '/terms',
      '/tos',
      '/terms-of-use',
      '/terms-and-conditions',
      '/termsofservice',
      '/termsofuse',
      '/legal/terms',
      '/policies/terms',
      '/terms-conditions',
    ],
    linkTextPatterns: [
      'terms of service',
      'terms of use',
      'terms & conditions',
      'terms and conditions',
      'tos',
    ],
    metaPatterns: ['terms of service', 'terms of use', 'terms and conditions'],
  },
  {
    type: 'sms_policy',
    label: 'SMS / Messaging Policy',
    variants: [
      '/sms-policy',
      '/sms-terms',
      '/messaging-policy',
      '/text-messaging-policy',
      '/sms',
      '/sms-consent',
      '/text-policy',
      '/messaging-terms',
      '/communication-policy',
      '/sms-messaging-policy',
      '/text-messaging-terms',
      '/mobile-terms',
    ],
    linkTextPatterns: [
      'sms policy',
      'sms terms',
      'messaging policy',
      'text messaging',
      'text policy',
      'mobile terms',
      'messaging terms',
    ],
    metaPatterns: ['sms policy', 'messaging policy', 'text messaging', 'sms terms'],
  },
];
