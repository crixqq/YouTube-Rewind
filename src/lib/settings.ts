export interface CustomProfile {
  name: string;
  settings: Partial<Settings>;
}

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
  customLogoScale: number;
  hideLogoAnimation: boolean;
  hidePlayables: boolean;
  hideFilterBar: boolean;
  disableAvatarLiveRedirect: boolean;
  language: string;
  // v0.4.0
  playbackSpeed: number;
  defaultQuality: string;
  watchTimerEnabled: boolean;
  watchTimeLimitMinutes: number;
  activeProfile: string;
  downloadThumbnailButton: boolean;
  watchTimeLimitBlockRepeat: boolean;
  customProfiles: CustomProfile[];
  betaEnabled: boolean;
  betaStandalonePage: boolean;
  betaHomepageRevealAnimation: boolean;
  betaVideoFrameScreenshot: boolean;
  betaScreenshotOpenPreview: boolean;
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
  customLogoScale: 100,
  hideLogoAnimation: false,
  hidePlayables: false,
  hideFilterBar: false,
  disableAvatarLiveRedirect: false,
  language: 'auto',
  // v0.4.0
  playbackSpeed: 0,
  defaultQuality: 'auto',
  watchTimerEnabled: false,
  watchTimeLimitMinutes: 0,
  activeProfile: 'none',
  downloadThumbnailButton: false,
  watchTimeLimitBlockRepeat: true,
  customProfiles: [],
  betaEnabled: false,
  betaStandalonePage: false,
  betaHomepageRevealAnimation: false,
  betaVideoFrameScreenshot: false,
  betaScreenshotOpenPreview: false,
};

const STORAGE_KEY = 'ytr_settings';
const WATCH_TIME_KEY = 'ytr_watch_time';

const VALID_BANNER_STYLES = ['none', 'sharp'];
const VALID_QUALITIES = ['auto', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', '4320p'];

export const QUALITY_MAP: Record<string, number> = {
  '4320p': 4320,
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
  '240p': 240,
  '144p': 144,
};

export const PROFILES: Record<string, Partial<Settings>> = {
  focus: {
    hideShorts: true,
    hidePosts: true,
    hideMixes: true,
    hideBreakingNews: true,
    hideLatestPosts: true,
    hideExploreTopics: true,
    hidePlayables: true,
    hideFilterBar: true,
    hideTopbarCreate: true,
    hideTopbarVoiceSearch: true,
    hideTopbarNotifications: true,
    hideCountryCode: true,
    hideSearchShorts: true,
    hideSearchPeopleWatched: true,
    hideSidebarExplore: true,
    hideSidebarMoreFromYT: true,
    hideSidebarFooter: true,
    hideJoinButton: true,
    hideClipButton: true,
    hideThanksButton: true,
    hideSaveButton: true,
    hideNewBadge: true,
    thumbnailEffect: 'grayscale',
    thumbnailHoverReveal: false,
    disableHoverAnimation: true,
    widePlayer: true,
    watchTimerEnabled: true,
    watchTimeLimitMinutes: 45,
    watchTimeLimitBlockRepeat: true,
    downloadThumbnailButton: true,
    disableAvatarLiveRedirect: true,
  },
  minimal: {
    hideShorts: true,
    hidePosts: true,
    hideMixes: true,
    hideBreakingNews: true,
    hideLatestPosts: true,
    hideExploreTopics: true,
    hidePlayables: true,
    hideFilterBar: true,
    hideTopbarCreate: true,
    hideTopbarVoiceSearch: true,
    hideTopbarNotifications: true,
    hideTopbarSearch: true,
    hideCountryCode: true,
    hideSearchShorts: true,
    hideSearchChannels: true,
    hideSearchPeopleWatched: true,
    hideSidebarSubscriptions: true,
    hideSidebarYou: true,
    hideSidebarExplore: true,
    hideSidebarMoreFromYT: true,
    hideSidebarReportHistory: true,
    hideSidebarFooter: true,
    hideNewBadge: true,
    hideJoinButton: true,
    hideDownloadButton: true,
    hideThanksButton: true,
    hideClipButton: true,
    hideSaveButton: true,
    hideLogoAnimation: true,
    disableHoverAnimation: true,
    bannerStyle: 'sharp',
    thumbnailShape: 'sharp',
    avatarShape: 'superellipse',
    classicLikeIcons: true,
  },
  clean: {
    hideShorts: true,
    hidePosts: true,
    hideMixes: true,
    hideBreakingNews: true,
    hideLatestPosts: true,
    hideNewBadge: true,
    hidePlayables: true,
    hideFilterBar: true,
    hideTopbarCreate: true,
    hideCountryCode: true,
    hideTopbarNotifications: true,
    avatarShape: 'superellipse',
    thumbnailShape: 'rounded',
    bannerStyle: 'sharp',
    classicLikeIcons: true,
    classicPlayer: true,
    widePlayer: true,
    downloadThumbnailButton: true,
    hideLogoAnimation: true,
    disableAvatarLiveRedirect: true,
  },
};

function normalizeSettings(input: Partial<Settings> = {}): Settings {
  const normalized = { ...DEFAULT_SETTINGS, ...input };
  if (!VALID_BANNER_STYLES.includes(normalized.bannerStyle)) {
    normalized.bannerStyle = 'none';
  }
  if (!VALID_QUALITIES.includes(normalized.defaultQuality)) {
    normalized.defaultQuality = 'auto';
  }
  if (!Array.isArray(normalized.customProfiles)) {
    normalized.customProfiles = [];
  }
  if (!Number.isFinite(normalized.customLogoScale)) {
    normalized.customLogoScale = 100;
  }
  normalized.customLogoScale = Math.min(220, Math.max(40, Math.round(normalized.customLogoScale)));
  if (!normalized.betaEnabled) {
    normalized.downloadThumbnailButton = false;
    normalized.disableAvatarLiveRedirect = false;
    normalized.betaStandalonePage = false;
    normalized.betaHomepageRevealAnimation = false;
    normalized.betaVideoFrameScreenshot = false;
    normalized.betaScreenshotOpenPreview = false;
  }
  if (!normalized.betaVideoFrameScreenshot) {
    normalized.betaScreenshotOpenPreview = false;
  }
  return normalized;
}

let queuedSettings: Settings | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function loadSettings(): Promise<Settings> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const merged = normalizeSettings(result[STORAGE_KEY] || {});
    queuedSettings = merged;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(settings: Settings): Promise<void> {
  const normalized = normalizeSettings(settings);
  queuedSettings = normalized;
  writeQueue = writeQueue.then(async () => {
    await browser.storage.local.set({ [STORAGE_KEY]: normalized });
  });
  return writeQueue;
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const base = queuedSettings ?? await loadSettings();
  await writeSettings({ ...base, ...partial });
}

// --- Watch time tracking ---

interface WatchTimeData {
  date: string; // YYYY-MM-DD
  minutes: number;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getWatchTime(): Promise<number> {
  try {
    const result = await browser.storage.local.get(WATCH_TIME_KEY);
    const data = result[WATCH_TIME_KEY] as WatchTimeData | undefined;
    if (data && data.date === todayKey()) return data.minutes;
    return 0;
  } catch {
    return 0;
  }
}

export async function addWatchTime(minutes: number): Promise<number> {
  const today = todayKey();
  const current = await getWatchTime();
  const total = current + minutes;
  await browser.storage.local.set({ [WATCH_TIME_KEY]: { date: today, minutes: total } });
  return total;
}

// --- Block overlay dismissed state (persisted per-day) ---

const BLOCK_DISMISSED_KEY = 'ytr_block_dismissed';

export async function getBlockDismissed(): Promise<boolean> {
  try {
    const result = await browser.storage.local.get(BLOCK_DISMISSED_KEY);
    const data = result[BLOCK_DISMISSED_KEY] as { date: string; dismissed: boolean } | undefined;
    if (data && data.date === todayKey()) return data.dismissed;
    return false;
  } catch {
    return false;
  }
}

export async function setBlockDismissed(dismissed: boolean): Promise<void> {
  await browser.storage.local.set({ [BLOCK_DISMISSED_KEY]: { date: todayKey(), dismissed } });
}
