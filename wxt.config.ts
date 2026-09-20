import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  zip: {
    includeSources: ['entrypoints/**', 'lib/**', 'assets/**', 'public/**', 'scripts/**', 'package.json', 'package-lock.json', 'tsconfig.json', 'wxt.config.ts', 'README.md', 'LICENSE', 'docs/BUILD.md'],
  },
  manifest: ({ browser }) => ({
    name: 'jevx',
    description: 'Find the posts worth your reply. Filter X with your interests and Jev.',
    permissions: ['storage'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'" },
    host_permissions: ['https://x.com/*', 'https://api.typesafe.ai/*'],
    minimum_chrome_version: browser === 'chrome' ? '116' : undefined,
    browser_specific_settings: browser === 'firefox' ? {
      gecko: {
        id: 'jevx@extensions.local',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['websiteContent', 'authenticationInfo', 'personallyIdentifyingInfo', 'personalCommunications', 'searchTerms'],
        },
      },
      gecko_android: { strict_min_version: '142.0' },
    } : undefined,
  }),
});
