import { DEFAULT_SETTINGS } from '@/lib/settings';

export default defineBackground(() => {
  const STORAGE_KEY = 'ytr_settings';

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      const existing = await browser.storage.local.get(STORAGE_KEY);
      if (!existing[STORAGE_KEY]) {
        await browser.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
      }
    }
  });
});
