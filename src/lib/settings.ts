export interface Settings {
  adaptiveColorsDescription: boolean;
  hideTopbarCreate: boolean;
  hideTopbarVoiceSearch: boolean;
  hideTopbarNotifications: boolean;
  hideCountryCode: boolean;
  hideTopbarSearch: boolean;
  thumbnailEffect: string;
  thumbnailHoverReveal: boolean;
  videosPerRow: number;
  hideShorts: boolean;
  hidePosts: boolean;
  hideMixes: boolean;
  hideBreakingNews: boolean;
  hideLatestPosts: boolean;
  hideExploreTopics: boolean;
  hideSearchShorts: boolean;
  hideSearchChannels: boolean;
  hideSearchPeopleWatched: boolean;
  hideSidebarSubscriptions: boolean;
  hideSidebarYou: boolean;
  hideSidebarExplore: boolean;
  hideSidebarMoreFromYT: boolean;
  hideSidebarReportHistory: boolean;
  hideSidebarFooter: boolean;
  avatarShape: string;
  thumbnailShape: string;
  disableHoverAnimation: boolean;
  bannerStyle: string;
  classicLikeIcons: boolean;
  classicPlayer: boolean;
  widePlayer: boolean;
  hideJoinButton: boolean;
  hideSubscribeButton: boolean;
  hideLikeDislike: boolean;
  hideShareButton: boolean;
  hideDownloadButton: boolean;
  hideClipButton: boolean;
  hideThanksButton: boolean;
  hideSaveButton: boolean;
  hideNewBadge: boolean;
  customLogo: string;
  customLogoRatio: number;
  language: string;
}

export const DEFAULT_SETTINGS: Settings = {
  adaptiveColorsDescription: false,
  hideTopbarCreate: false,
  hideTopbarVoiceSearch: false,
  hideTopbarNotifications: false,
  hideCountryCode: false,
  hideTopbarSearch: false,
  thumbnailEffect: 'none',
  thumbnailHoverReveal: true,
  videosPerRow: 0,
  hideShorts: false,
  hidePosts: false,
  hideMixes: false,
  hideBreakingNews: false,
  hideLatestPosts: false,
  hideExploreTopics: false,
  hideSearchShorts: false,
  hideSearchChannels: false,
  hideSearchPeopleWatched: false,
  hideSidebarSubscriptions: false,
  hideSidebarYou: false,
  hideSidebarExplore: false,
  hideSidebarMoreFromYT: false,
  hideSidebarReportHistory: false,
  hideSidebarFooter: false,
  avatarShape: 'none',
  thumbnailShape: 'none',
  disableHoverAnimation: false,
  bannerStyle: 'none',
  classicLikeIcons: false,
  classicPlayer: false,
  widePlayer: false,
  hideJoinButton: false,
  hideSubscribeButton: false,
  hideLikeDislike: false,
  hideShareButton: false,
  hideDownloadButton: false,
  hideClipButton: false,
  hideThanksButton: false,
  hideSaveButton: false,
  hideNewBadge: false,
  customLogo: '',
  customLogoRatio: 0,
  language: 'auto',
};

const STORAGE_KEY = 'ytr_settings';

const VALID_BANNER_STYLES = ['none', 'sharp'];

export async function loadSettings(): Promise<Settings> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const merged = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] || {}) };
    if (!VALID_BANNER_STYLES.includes(merged.bannerStyle)) {
      merged.bannerStyle = 'none';
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const current = await loadSettings();
  const merged = { ...current, ...partial };
  await browser.storage.local.set({ [STORAGE_KEY]: merged });
}
