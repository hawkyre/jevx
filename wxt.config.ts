import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'jevx',
    description: 'Find the posts worth your reply. Filter X with your interests and Jev.',
    permissions: ['storage'],
    host_permissions: ['https://x.com/*', 'https://api.typesafe.ai/*'],
    minimum_chrome_version: browser === 'chrome' ? '116' : undefined,
    browser_specific_settings: browser === 'firefox' ? {
      gecko: {
        id: 'jevx@extensions.local',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['websiteContent', 'authenticationInfo'],
        },
      },
      gecko_android: { strict_min_version: '142.0' },
    } : undefined,
  }),
});
