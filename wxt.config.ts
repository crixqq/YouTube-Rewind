import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    permissions: ['storage', 'clipboardRead', 'clipboardWrite'],
    host_permissions: [
      'https://img.youtube.com/*',
      'https://i.ytimg.com/*',
      'https://api.github.com/*',
      'https://addons.mozilla.org/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: '{e0f1a5b2-7c3d-4e8f-9a6b-1d2c3e4f5a6b}',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
