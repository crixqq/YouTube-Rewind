import { DEFAULT_SETTINGS } from '@/lib/settings';

export default defineBackground(() => {
  const STORAGE_KEY = 'ytr_settings';
  const LEGACY_VIDEO_INSIGHTS_KEY = ['ytr', 'video', 'insights'].join('_');
  type CaptureTabMessage = { type?: string };
  type RuntimeSender = { tab?: { windowId?: number } };

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      const existing = await browser.storage.local.get(STORAGE_KEY);
      if (!existing[STORAGE_KEY]) {
        await browser.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
      }
    }
    await browser.storage.local.remove(LEGACY_VIDEO_INSIGHTS_KEY).catch(() => {});
  });

  browser.runtime.onMessage.addListener((message: unknown, sender: RuntimeSender) => {
    if (!message || typeof message !== 'object' || (message as CaptureTabMessage).type !== 'ytr_capture_visible_tab') {
      return undefined;
    }

    return browser.tabs.captureVisibleTab(sender.tab?.windowId, { format: 'png' })
      .then((dataUrl) => ({ dataUrl }))
      .catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
  });
});
