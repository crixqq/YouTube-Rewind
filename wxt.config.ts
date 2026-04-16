import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    action: {
      default_icon: {
        '16': 'icon/16.png',
        '32': 'icon/32.png',
        '48': 'icon/48.png',
        '96': 'icon/96.png',
        '128': 'icon/128.png',
      },
    },
    permissions: ['storage', 'unlimitedStorage', 'clipboardRead', 'clipboardWrite'],
    host_permissions: [
      '*://*.youtube.com/*',
      'https://i.ytimg.com/*',
      'https://api.github.com/*',
      'https://addons.mozilla.org/*',
    ],
    web_accessible_resources: [
      {
        resources: ['default-quality-bridge.js', 'logo-header.png'],
        matches: ['*://*.youtube.com/*'],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: '{e0f1a5b2-7c3d-4e8f-9a6b-1d2c3e4f5a6b}',
        strict_min_version: '140.0',
      },
    },
  },
});
