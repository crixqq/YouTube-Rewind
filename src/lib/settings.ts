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
  disableThumbnailPreview: boolean;
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
  logoVariant: 'youtube' | 'rewind' | 'custom';
  customLogo: string;
  customLogoRatio: number;
  youtubeLogoScale: number;
  rewindLogoScale: number;
  customLogoScale: number;
  hideLogoAnimation: boolean;
  hidePlayables: boolean;
  hideFilterBar: boolean;
  disableAvatarLiveRedirect: boolean;
  language: string;
  // v0.5.0
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
  betaScreenshotInstantDownload: boolean;
  developerEnabled: boolean;
  interfaceThemeMode: 'auto' | 'dark' | 'light';
  interfaceThemeHue: number;
  interfaceThemeColor: string;
}

export const BUILTIN_REWIND_LOGO_RATIO = 3464 / 608;

export const DEFAULT_SETTINGS: Settings = {
  adaptiveColorsDescription: false,
  hideTopbarCreate: false,
  hideTopbarVoiceSearch: false,
  hideTopbarNotifications: false,
  hideCountryCode: false,
  hideTopbarSearch: false,
  thumbnailEffect: 'none',
  thumbnailHoverReveal: true,
  disableThumbnailPreview: false,
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
  logoVariant: 'rewind',
  customLogo: '',
  customLogoRatio: 0,
  youtubeLogoScale: 85,
  rewindLogoScale: 160,
  customLogoScale: 160,
  hideLogoAnimation: true,
  hidePlayables: false,
  hideFilterBar: false,
  disableAvatarLiveRedirect: false,
  language: 'auto',
  // v0.5.0
  playbackSpeed: 0,
  defaultQuality: 'auto',
  watchTimerEnabled: false,
  watchTimeLimitMinutes: 0,
  activeProfile: 'none',
  downloadThumbnailButton: false,
  watchTimeLimitBlockRepeat: true,
  customProfiles: [],
  betaEnabled: false,
  betaStandalonePage: true,
  betaHomepageRevealAnimation: false,
  betaVideoFrameScreenshot: false,
  betaScreenshotInstantDownload: false,
  developerEnabled: false,
  interfaceThemeMode: 'auto',
  interfaceThemeHue: 248,
  interfaceThemeColor: '#c8bfff',
};

const STORAGE_KEY = 'ytr_settings';
const WATCH_TIME_KEY = 'ytr_watch_time';

const VALID_BANNER_STYLES = ['none', 'sharp'];
const VALID_QUALITIES = ['auto', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', '4320p'];
const VALID_INTERFACE_THEME_MODES = ['auto', 'dark', 'light'];
const VALID_LOGO_VARIANTS = ['youtube', 'rewind', 'custom'];
const HEX_COLOR_RE = /^#([0-9a-f]{6})$/i;

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
    disableThumbnailPreview: true,
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
    disableThumbnailPreview: true,
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

function clampHue(value: number): number {
  return Math.min(360, Math.max(0, Math.round(value)));
}

function normalizeThumbnailShape(value: unknown): string {
  if (value === 'scallop') return 'superellipse';
  if (value === 'fan') return 'arch';
  return typeof value === 'string' ? value : DEFAULT_SETTINGS.thumbnailShape;
}

function parseThemeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return HEX_COLOR_RE.test(normalized) ? normalized : null;
}

function rgbToHue(r: number, g: number, b: number, fallback = DEFAULT_SETTINGS.interfaceThemeHue): number {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  if (delta < 0.0001) return clampHue(fallback);

  let hue = 0;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  return clampHue(hue * 60);
}

function hueFromHex(value: string, fallback = DEFAULT_SETTINGS.interfaceThemeHue): number {
  const normalized = parseThemeColor(value);
  if (!normalized) return clampHue(fallback);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return rgbToHue(red, green, blue, fallback);
}

function seedHexFromHue(hue: number): string {
  const normalizedHue = (((hue % 360) + 360) % 360) / 360;
  const saturation = 0.78;
  const lightness = 0.87;

  const hueToRgb = (p: number, q: number, t: number): number => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const red = Math.round(hueToRgb(p, q, normalizedHue + 1 / 3) * 255);
  const green = Math.round(hueToRgb(p, q, normalizedHue) * 255);
  const blue = Math.round(hueToRgb(p, q, normalizedHue - 1 / 3) * 255);

  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeSettings(input: Partial<Settings> = {}): Settings {
  const normalized = { ...DEFAULT_SETTINGS, ...input } as Settings & Record<string, unknown>;
  const legacyKeysToDelete = [
    'betaScreenshotOpenPreview',
    ['video', 'InsightsEnabled'].join(''),
    ['video', 'InsightsShowObservedChanges'].join(''),
    ['thumbnail', 'SourceVariant'].join(''),
  ] as const;
  const legacyScreenshotOpenPreview = typeof normalized.betaScreenshotOpenPreview === 'boolean'
    ? normalized.betaScreenshotOpenPreview
    : undefined;

  if (typeof normalized.betaScreenshotInstantDownload !== 'boolean') {
    normalized.betaScreenshotInstantDownload = legacyScreenshotOpenPreview === undefined
      ? false
      : !legacyScreenshotOpenPreview;
  }

  if (!VALID_BANNER_STYLES.includes(normalized.bannerStyle)) {
    normalized.bannerStyle = 'none';
  }
  if (!VALID_LOGO_VARIANTS.includes(normalized.logoVariant)) {
    normalized.logoVariant = normalized.customLogo ? 'custom' : DEFAULT_SETTINGS.logoVariant;
  }
  if (!VALID_QUALITIES.includes(normalized.defaultQuality)) {
    normalized.defaultQuality = 'auto';
  }
  if (!VALID_INTERFACE_THEME_MODES.includes(normalized.interfaceThemeMode)) {
    normalized.interfaceThemeMode = 'auto';
  }
  normalized.interfaceThemeColor = parseThemeColor(normalized.interfaceThemeColor)
    || seedHexFromHue(normalized.interfaceThemeHue)
    || DEFAULT_SETTINGS.interfaceThemeColor;
  if (!Number.isFinite(normalized.interfaceThemeHue)) {
    normalized.interfaceThemeHue = hueFromHex(normalized.interfaceThemeColor);
  }
  normalized.interfaceThemeHue = hueFromHex(normalized.interfaceThemeColor, normalized.interfaceThemeHue);
  if (!Array.isArray(normalized.customProfiles)) {
    normalized.customProfiles = [];
  }
  normalized.thumbnailShape = normalizeThumbnailShape(normalized.thumbnailShape);
  normalized.customProfiles = normalized.customProfiles.map((profile) => {
    const profileSettings = { ...(profile?.settings || {}) } as Partial<Settings> & Record<string, unknown>;
    delete profileSettings.developerEnabled;
    delete profileSettings.betaStandalonePage;
    profileSettings.thumbnailShape = normalizeThumbnailShape(profileSettings.thumbnailShape);
    if (typeof profileSettings.betaScreenshotInstantDownload !== 'boolean' && typeof profileSettings.betaScreenshotOpenPreview === 'boolean') {
      profileSettings.betaScreenshotInstantDownload = !profileSettings.betaScreenshotOpenPreview;
    }
    if (profileSettings.interfaceThemeMode && !VALID_INTERFACE_THEME_MODES.includes(profileSettings.interfaceThemeMode)) {
      delete profileSettings.interfaceThemeMode;
    }
    const normalizedProfileColor = parseThemeColor(profileSettings.interfaceThemeColor);
    if (profileSettings.interfaceThemeColor && !normalizedProfileColor) {
      delete profileSettings.interfaceThemeColor;
    }
    if (normalizedProfileColor) {
      profileSettings.interfaceThemeColor = normalizedProfileColor;
    }
    if (typeof profileSettings.interfaceThemeHue === 'number' && !Number.isFinite(profileSettings.interfaceThemeHue)) {
      delete profileSettings.interfaceThemeHue;
    }
    if (typeof profileSettings.interfaceThemeHue === 'number') {
      profileSettings.interfaceThemeHue = clampHue(profileSettings.interfaceThemeHue);
    }
    if (typeof profileSettings.interfaceThemeColor === 'string') {
      profileSettings.interfaceThemeHue = hueFromHex(profileSettings.interfaceThemeColor, profileSettings.interfaceThemeHue);
    }
    for (const key of legacyKeysToDelete) {
      delete profileSettings[key];
    }
    return {
      name: profile?.name || 'Custom',
      settings: profileSettings,
    };
  });
  if (!Number.isFinite(normalized.youtubeLogoScale)) {
    normalized.youtubeLogoScale = DEFAULT_SETTINGS.youtubeLogoScale;
  }
  normalized.youtubeLogoScale = Math.min(220, Math.max(40, Math.round(normalized.youtubeLogoScale)));
  if (!Number.isFinite(normalized.rewindLogoScale)) {
    normalized.rewindLogoScale = Number.isFinite(normalized.customLogoScale)
      ? normalized.customLogoScale
      : DEFAULT_SETTINGS.rewindLogoScale;
  }
  normalized.rewindLogoScale = Math.min(220, Math.max(40, Math.round(normalized.rewindLogoScale)));
  if (!Number.isFinite(normalized.customLogoScale)) {
    normalized.customLogoScale = DEFAULT_SETTINGS.customLogoScale;
  }
  normalized.customLogoScale = Math.min(220, Math.max(40, Math.round(normalized.customLogoScale)));
  if (!Number.isFinite(normalized.customLogoRatio)) {
    normalized.customLogoRatio = 0;
  }
  normalized.betaStandalonePage = true;
  if (!normalized.betaEnabled) {
    normalized.disableAvatarLiveRedirect = false;
    normalized.betaHomepageRevealAnimation = false;
    normalized.defaultQuality = 'auto';
  }
  if (!normalized.betaVideoFrameScreenshot) {
    normalized.betaScreenshotInstantDownload = false;
  }
  if (typeof normalized.developerEnabled !== 'boolean') {
    normalized.developerEnabled = DEFAULT_SETTINGS.developerEnabled;
  }
  for (const key of legacyKeysToDelete) {
    delete normalized[key];
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

export async function clearWatchTimeState(): Promise<void> {
  await browser.storage.local.remove([WATCH_TIME_KEY, BLOCK_DISMISSED_KEY]);
}
