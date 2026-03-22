export interface Settings {
  adaptiveColorsDescription: boolean;
  hideTopbarCreate: boolean;
  hideTopbarVoiceSearch: boolean;
  hideTopbarNotifications: boolean;
  hideCountryCode: boolean;
  customLogo: string;
  thumbnailEffect: string;
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
  classicPlayer: boolean;
  widePlayer: boolean;
  language: string;
}

export const DEFAULT_SETTINGS: Settings = {
  adaptiveColorsDescription: false,
  hideTopbarCreate: false,
  hideTopbarVoiceSearch: false,
  hideTopbarNotifications: false,
  hideCountryCode: false,
  customLogo: '',
  thumbnailEffect: 'none',
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
  classicPlayer: false,
  widePlayer: false,
  language: 'auto',
};

const STORAGE_KEY = 'ytr_settings';

export async function loadSettings(): Promise<Settings> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const current = await loadSettings();
  const merged = { ...current, ...partial };
  await browser.storage.local.set({ [STORAGE_KEY]: merged });
}
