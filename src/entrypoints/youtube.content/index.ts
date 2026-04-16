import type { Settings } from '@/lib/settings';
import { BUILTIN_REWIND_LOGO_RATIO, DEFAULT_SETTINGS, loadSettings, addWatchTime, getWatchTime, getBlockDismissed, setBlockDismissed } from '@/lib/settings';
import './style.css';

let currentSettings: Settings | null = null;
const BUILTIN_REWIND_LOGO_URL = browser.runtime.getURL('logo-header.png');
type ManagedLogoKind = 'rewind' | 'custom';
type ResolvedThemeMode = 'light' | 'dark';
type OverlayGalleryItem = {
  src: string;
  filename: string;
  label: string;
  kind?: 'original' | 'creator-test' | 'youtube-test' | 'history';
  metaLabel?: string;
  hash?: string | null;
  timestamp?: number | null;
  status?: 'published' | 'first-seen' | 'observed' | 'archived' | 'current';
};
type OverlayOptions = { drawing?: boolean };
type ContentLocale = 'ru' | 'en';
type OverlayDrawTool = 'none' | 'pencil' | 'eraser';
type OverlayStroke = {
  tool: Exclude<OverlayDrawTool, 'none'>;
  color: string;
  sizeRatio: number;
  points: { x: number; y: number }[];
};
type CaptureVisibleTabResponse = { dataUrl?: string; error?: string };
type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};
let feedRevealObserver: IntersectionObserver | null = null;
let qualityBridgeInjected = false;
let logoStateObserver: MutationObserver | null = null;
let observedLogoRenderer: HTMLElement | null = null;
let youtubeThemeObserver: MutationObserver | null = null;
let youtubeThemeSyncRaf = 0;
let playerFullscreenObserver: MutationObserver | null = null;
let observedFullscreenPlayer: Element | null = null;
let customLogoSyncTimers: number[] = [];
let youtubeLogoMetricSyncTimers: number[] = [];
let feedRevealSyncTimers: number[] = [];
let fullScanTimers: number[] = [];
let prefetchMutationObserver: MutationObserver | null = null;
let prefetchObservedRoot: Element | null = null;
let prefetchRaf = 0;
let prefetchRetryTimer: number | null = null;
let prefetchLastFeedCount = 0;
let prefetchBurstCount = 0;
let prefetchLastResizeSignal = 0;
let prefetchLastRequestedCount = 0;
let prefetchLastViewportResizeAt = 0;
let prefetchScrollHandler: (() => void) | null = null;
let prefetchResizeHandler: (() => void) | null = null;
let prefetchNavigateHandler: (() => void) | null = null;
let documentScanObserver: MutationObserver | null = null;
let activeOverlayCleanup: (() => void) | null = null;
const MIN_FALLBACK_THUMBNAIL_WIDTH = 120;
const MIN_FALLBACK_THUMBNAIL_HEIGHT = 90;
const OBSERVER_IGNORED_REGION_SELECTOR = [
  '#movie_player',
  '#player',
  '.html5-video-player',
  '#player-container',
  '.ytp-tooltip',
  '.ytp-popup',
  '.ytp-settings-menu',
  '.ytp-progress-bar-container',
  '#previewbar',
  '.sponsorBlockChapterBar',
  '.sponsorSkipNoticeContainer',
  '.sponsorSkipNoticeParent',
  '.sponsorSkipNotice',
].join(', ');

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',

  async main() {
    const settings = await loadSettings();
    currentSettings = settings;
    ensureYoutubeThemeObserver();
    applySettings(settings);
    syncPageContextFlags();
    if (needsWatchPageEnhancements(settings)) {
      setupPlaybackSpeed(settings);
      setupDefaultQuality(settings);
      setupDownloadThumbnailButton(settings);
    }
    if (needsFullscreenTracking(settings)) {
      setupFullscreenDetection();
    }
    queueInitialEnhancements(settings);
    document.addEventListener('yt-navigate-finish', () => {
      syncPageContextFlags();
      if (currentSettings && needsWatchPageEnhancements(currentSettings)) {
        setupPlaybackSpeed(currentSettings);
        setupDefaultQuality(currentSettings);
        setupDownloadThumbnailButton(currentSettings);
      }
      if (hasResolvedCustomLogo(currentSettings)) {
        scheduleCustomLogoSync([240, 960]);
      }
      if (currentSettings?.logoVariant === 'rewind') {
        window.setTimeout(() => syncRewindLogoTheme(), 240);
        window.setTimeout(() => syncRewindLogoTheme(), 960);
      }
      if (currentSettings?.logoVariant === 'youtube') {
        scheduleYouTubeLogoMetricSync([240, 960]);
      }
      scheduleFeedRevealSync([180, 560]);
    });

    browser.storage.onChanged.addListener((changes) => {
      if (changes.ytr_settings?.newValue) {
        const previousLocale = getContentLocale(currentSettings);
        const s = changes.ytr_settings.newValue as Settings;
        const nextLocale = getContentLocale(s);
        if (nextLocale !== previousLocale) {
          window.location.reload();
          return;
        }
        currentSettings = s;
        applySettings(s);
        syncPageContextFlags();
        if (getActiveScanFlags()) {
          startObserver();
          refreshObservedScanRoots();
        } else {
          refreshObservedScanRoots();
        }
        scheduleCustomLogoSync();
        scheduleYouTubeLogoMetricSync();
        scheduleFeedRevealSync();
        tagExploreSections();
        tagSidebarSections();
        tagActionButtons();
        tagFeedItems();
        setupPlaybackSpeed(s);
        setupDefaultQuality(s);
        setupWatchTimer(s);
        setupDownloadThumbnailButton(s);
        setupFullscreenDetection();
      }
    });
  },
});

function getContentLocale(settings: Settings | null = currentSettings): ContentLocale {
  const rawLocale = (settings?.language === 'auto'
    ? browser.i18n.getUILanguage()
    : settings?.language || 'en'
  ).toLowerCase();
  return rawLocale.startsWith('ru') ? 'ru' : 'en';
}

function scheduleLowPriorityTask(task: () => void, timeout = 1200, fallbackDelay = 120): number {
  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === 'function') {
    return idleWindow.requestIdleCallback(task, { timeout });
  }

  return window.setTimeout(task, fallbackDelay);
}

function needsWatchPageEnhancements(settings: Settings): boolean {
  return settings.playbackSpeed > 0
    || getEffectiveDefaultQuality(settings) !== 'auto'
    || settings.downloadThumbnailButton
    || settings.betaVideoFrameScreenshot;
}

function needsFullscreenTracking(settings: Settings): boolean {
  return settings.watchTimerEnabled || settings.watchTimeLimitMinutes > 0;
}

function getResolvedLogoKind(settings: Settings | null): ManagedLogoKind | null {
  if (!settings) return null;
  if (settings.logoVariant === 'rewind') return 'rewind';
  if (settings.logoVariant === 'custom' && settings.customLogo) return 'custom';
  return null;
}

function getResolvedLogoSource(settings: Settings | null): string | null {
  if (!settings) return null;
  if (settings.logoVariant === 'rewind') return BUILTIN_REWIND_LOGO_URL;
  if (settings.logoVariant === 'custom' && settings.customLogo) return settings.customLogo;
  return null;
}

function getResolvedLogoRatio(settings: Settings | null): number | 'auto' {
  if (!settings) return 'auto';
  if (settings.logoVariant === 'rewind') {
    return BUILTIN_REWIND_LOGO_RATIO;
  }
  if (settings.logoVariant === 'custom') {
    return settings.customLogoRatio || 'auto';
  }
  return 'auto';
}

function hasResolvedCustomLogo(settings: Settings | null): boolean {
  return !!getResolvedLogoKind(settings);
}

function getLogoScale(settings: Settings | null, variant = settings?.logoVariant || 'youtube'): number {
  if (!settings) {
    if (variant === 'rewind') return DEFAULT_SETTINGS.rewindLogoScale;
    if (variant === 'custom') return DEFAULT_SETTINGS.customLogoScale;
    return DEFAULT_SETTINGS.youtubeLogoScale;
  }

  if (variant === 'rewind') return settings.rewindLogoScale || DEFAULT_SETTINGS.rewindLogoScale;
  if (variant === 'custom') return settings.customLogoScale || DEFAULT_SETTINGS.customLogoScale;
  return settings.youtubeLogoScale || DEFAULT_SETTINGS.youtubeLogoScale;
}

function queueInitialEnhancements(settings: Settings): void {
  if (hasResolvedCustomLogo(settings)) {
    scheduleLowPriorityTask(() => scheduleCustomLogoSync(), 900, 80);
  }
  if (settings.logoVariant === 'rewind') {
    scheduleLowPriorityTask(() => syncRewindLogoTheme(settings), 900, 80);
  }
  if (settings.logoVariant === 'youtube') {
    scheduleLowPriorityTask(() => scheduleYouTubeLogoMetricSync([0, 240, 960]), 900, 80);
  }

  if (getActiveScanFlags()) {
    scheduleLowPriorityTask(() => startObserver(), 1200, 160);
  }

  if (needsWatchPageEnhancements(settings)) {
    scheduleLowPriorityTask(() => {
      setupPlaybackSpeed(settings);
      setupDefaultQuality(settings);
      setupDownloadThumbnailButton(settings);
    }, 1400, 220);
  }

  if (settings.watchTimerEnabled || settings.watchTimeLimitMinutes > 0) {
    scheduleLowPriorityTask(() => setupWatchTimer(settings), 1600, 280);
  }

  if (needsFullscreenTracking(settings)) {
    scheduleLowPriorityTask(() => setupFullscreenDetection(), 1800, 360);
  }
}

function injectDefaultQualityBridge(): void {
  if (qualityBridgeInjected) return;
  qualityBridgeInjected = true;

  const scriptId = 'ytr-default-quality-bridge';
  if (document.getElementById(scriptId)) return;

  const script = document.createElement('script');
  script.id = scriptId;
  const bridgePath = 'default-quality-bridge.js' as Parameters<typeof browser.runtime.getURL>[0];
  script.src = browser.runtime.getURL(bridgePath);
  script.async = false;
  script.onload = () => {
    dispatchDefaultQualityBridge(getEffectiveDefaultQuality(currentSettings));
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

function dispatchDefaultQualityBridge(quality: string): void {
  const targets: Array<Window | Document | HTMLElement | null> = [
    window,
    document,
    document.documentElement,
  ];

  for (const target of targets) {
    target?.dispatchEvent(new CustomEvent('ytr:set-default-quality', {
      detail: { quality },
    }));
  }
}

function getEffectiveDefaultQuality(settings: Settings | null): string {
  if (!settings?.betaEnabled) return 'auto';
  return settings.defaultQuality || 'auto';
}

function isObserverIgnoredNode(node: Node | null): boolean {
  if (!(node instanceof Element)) return false;
  return !!node.closest(OBSERVER_IGNORED_REGION_SELECTOR);
}

function getMainVideoElement(): HTMLVideoElement | null {
  const selectors = [
    '#movie_player video.html5-main-video',
    '#movie_player .html5-video-player video',
    'ytd-player #movie_player video',
    '#player video.html5-main-video',
    '#player video',
  ];

  for (const selector of selectors) {
    const video = document.querySelector(selector);
    if (video instanceof HTMLVideoElement) return video;
  }

  const candidates = [...document.querySelectorAll('video')].filter((video): video is HTMLVideoElement => video instanceof HTMLVideoElement);
  return candidates.find((video) => video.classList.contains('html5-main-video'))
    ?? candidates.find((video) => !!video.closest('#movie_player, ytd-player, #player'))
    ?? null;
}

function setElementFlag(element: Element, name: string, enabled: boolean): void {
  if (enabled) {
    element.setAttribute(name, 'true');
    return;
  }

  element.removeAttribute(name);
}

function syncPageContextFlags(): void {
  document.documentElement.dataset.ytrHomePage = String(!!document.querySelector('ytd-browse[page-subtype="home"]'));
}

function needsExploreTags(): boolean {
  const d = document.documentElement.dataset;
  return d.ytrHideShorts === 'true'
    || d.ytrHidePosts === 'true'
    || d.ytrHideBreakingNews === 'true'
    || d.ytrHideLatestPosts === 'true'
    || d.ytrHideExploreTopics === 'true'
    || d.ytrHidePlayables === 'true';
}

function needsSidebarTags(): boolean {
  const d = document.documentElement.dataset;
  return d.ytrHideShorts === 'true'
    || d.ytrHideSidebarSubscriptions === 'true'
    || d.ytrHideSidebarYou === 'true'
    || d.ytrHideSidebarExplore === 'true'
    || d.ytrHideSidebarMoreFromYt === 'true'
    || d.ytrHideSidebarReportHistory === 'true';
}

function needsFeedTags(): boolean {
  const d = document.documentElement.dataset;
  return d.ytrHideMixes === 'true'
    || d.ytrBetaFeedMotion === 'true'
    || d.ytrDisableAvatarLive === 'true'
    || d.ytrHideSearchShorts === 'true'
    || d.ytrHideSearchPeopleWatched === 'true'
    || d.ytrHideNewBadge === 'true';
}

function needsActionTags(): boolean {
  const d = document.documentElement.dataset;
  return d.ytrHideShareButton === 'true'
    || d.ytrHideDownloadButton === 'true'
    || d.ytrHideClipButton === 'true'
    || d.ytrHideThanksButton === 'true'
    || d.ytrHideSaveButton === 'true';
}

function applySettings(s: Settings): void {
  const el = document.documentElement;
  const d = el.dataset;

  d.ytrNoAdaptiveDesc = String(s.adaptiveColorsDescription);

  // Top bar
  d.ytrHideTopbarCreate = String(s.hideTopbarCreate);
  d.ytrHideTopbarVoiceSearch = String(s.hideTopbarVoiceSearch);
  d.ytrHideTopbarNotifications = String(s.hideTopbarNotifications);
  d.ytrHideCountryCode = String(s.hideCountryCode);
  d.ytrHideTopbarSearch = String(s.hideTopbarSearch);

  // Thumbnail effect
  d.ytrThumbnailEffect = s.thumbnailEffect || 'none';
  d.ytrThumbnailNoReveal = String(!s.thumbnailHoverReveal);
  d.ytrDisableThumbnailPreview = String(s.disableThumbnailPreview);

  // Inject pixel filter SVG only when needed
  if (s.thumbnailEffect === 'pixelate') injectPixelFilter();

  if (s.videosPerRow > 0) {
    d.ytrVideosPerRow = String(s.videosPerRow);
    el.style.setProperty('--ytr-videos-per-row', String(s.videosPerRow));
    scheduleLowPriorityTask(() => setupPrefetch(), 1400, 260);
  } else {
    delete d.ytrVideosPerRow;
    el.style.removeProperty('--ytr-videos-per-row');
    teardownPrefetch();
  }

  d.ytrHideShorts = String(s.hideShorts);
  d.ytrHidePosts = String(s.hidePosts);
  d.ytrHideMixes = String(s.hideMixes);
  d.ytrHideBreakingNews = String(s.hideBreakingNews);
  d.ytrHideLatestPosts = String(s.hideLatestPosts);
  d.ytrHideExploreTopics = String(s.hideExploreTopics);

  d.ytrHideSearchShorts = String(s.hideSearchShorts);
  d.ytrHideSearchChannels = String(s.hideSearchChannels);
  d.ytrHideSearchPeopleWatched = String(s.hideSearchPeopleWatched);

  d.ytrHideSidebarSubscriptions = String(s.hideSidebarSubscriptions);
  d.ytrHideSidebarYou = String(s.hideSidebarYou);
  d.ytrHideSidebarExplore = String(s.hideSidebarExplore);
  d.ytrHideSidebarMoreFromYt = String(s.hideSidebarMoreFromYT);
  d.ytrHideSidebarReportHistory = String(s.hideSidebarReportHistory);
  d.ytrHideSidebarFooter = String(s.hideSidebarFooter);

  d.ytrAvatarShape = s.avatarShape;
  d.ytrThumbnailShape = s.thumbnailShape || 'none';
  d.ytrDisableHoverAnimation = String(s.disableHoverAnimation);
  d.ytrBannerStyle = s.bannerStyle || 'none';
  d.ytrClassicLikeIcons = String(s.classicLikeIcons);
  d.ytrClassicPlayer = String(s.classicPlayer);
  d.ytrWidePlayer = String(s.widePlayer);
  d.ytrHideNewBadge = String(s.hideNewBadge);

  // Video buttons
  d.ytrHideJoinButton = String(s.hideJoinButton);
  d.ytrHideSubscribeButton = String(s.hideSubscribeButton);
  d.ytrHideLikeDislike = String(s.hideLikeDislike);
  d.ytrHideShareButton = String(s.hideShareButton);
  d.ytrHideDownloadButton = String(s.hideDownloadButton);
  d.ytrHideClipButton = String(s.hideClipButton);
  d.ytrHideThanksButton = String(s.hideThanksButton);
  d.ytrHideSaveButton = String(s.hideSaveButton);

  // Logo presentation
  const resolvedLogoKind = getResolvedLogoKind(s);
  const resolvedLogoSource = getResolvedLogoSource(s);
  const resolvedLogoRatio = getResolvedLogoRatio(s);
  d.ytrLogoVariant = s.logoVariant;
  el.style.setProperty('--ytr-youtube-logo-scale', String(getLogoScale(s, 'youtube') / 100));
  el.style.setProperty('--ytr-rewind-logo-scale', String(getLogoScale(s, 'rewind') / 100));
  el.style.setProperty('--ytr-custom-logo-scale', String(getLogoScale(s, 'custom') / 100));
  el.style.setProperty('--ytr-rewind-logo-ratio', String(BUILTIN_REWIND_LOGO_RATIO));
  el.style.setProperty('--ytr-rewind-logo-mask', `url("${BUILTIN_REWIND_LOGO_URL}")`);
  el.style.setProperty('--ytr-rewind-logo-color', getRewindLogoColor(s, getYoutubeThemeMode()));
  if (resolvedLogoKind) {
    d.ytrCustomLogo = 'true';
    d.ytrCustomLogoKind = resolvedLogoKind;
    el.style.setProperty('--ytr-custom-logo-ratio', String(resolvedLogoRatio));
    if (resolvedLogoKind === 'custom' && resolvedLogoSource) {
      el.style.setProperty('--ytr-custom-logo', `url("${resolvedLogoSource}")`);
    } else {
      el.style.removeProperty('--ytr-custom-logo');
    }
  } else {
    delete d.ytrCustomLogo;
    delete d.ytrCustomLogoKind;
    el.style.removeProperty('--ytr-custom-logo');
    el.style.removeProperty('--ytr-custom-logo-ratio');
    delete d.ytrCustomLogoState;
  }
  d.ytrHideLogoAnimation = String(s.hideLogoAnimation);
  syncCustomLogoElement(s);
  if (s.logoVariant === 'youtube') {
    scheduleYouTubeLogoMetricSync([0, 180, 720]);
  }

  // Playables
  d.ytrHidePlayables = String(s.hidePlayables);
  d.ytrHideFilterBar = String(s.hideFilterBar);
  d.ytrDisableAvatarLive = String(!!(s.betaEnabled && s.disableAvatarLiveRedirect));
  d.ytrBetaFeedMotion = String(!!(s.betaEnabled && s.betaHomepageRevealAnimation));
}

function isVideoLogo(src: string): boolean {
  return /^data:video\//i.test(src) || /\.(mp4|webm|ogg|mov)(?:$|[?#])/i.test(src);
}

function disconnectLogoStateObserver(): void {
  logoStateObserver?.disconnect();
  logoStateObserver = null;
  observedLogoRenderer = null;
}

function ensureYoutubeThemeObserver(): void {
  if (youtubeThemeObserver) return;

  youtubeThemeObserver = new MutationObserver(() => {
    if (youtubeThemeSyncRaf) return;
    youtubeThemeSyncRaf = requestAnimationFrame(() => {
      youtubeThemeSyncRaf = 0;
      syncRewindLogoTheme();
    });
  });

  youtubeThemeObserver.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['dark', 'class', 'style'],
  });
}

function hasActiveEventLogo(): boolean {
  const yoodle = document.querySelector('ytd-topbar-logo-renderer ytd-yoodle-renderer:not([hidden])') as HTMLElement | null;
  if (!yoodle) return false;

  const style = window.getComputedStyle(yoodle);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  const rect = yoodle.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function ensureLogoStateObserver(): void {
  const renderer = document.querySelector('ytd-topbar-logo-renderer') as HTMLElement | null;
  if (!renderer) {
    disconnectLogoStateObserver();
    return;
  }

  if (observedLogoRenderer === renderer && logoStateObserver) return;

  disconnectLogoStateObserver();
  observedLogoRenderer = renderer;
  logoStateObserver = new MutationObserver(() => {
    requestAnimationFrame(() => syncCustomLogoState());
  });
  logoStateObserver.observe(renderer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class'],
  });
}

function syncCustomLogoState(settings: Settings | null = currentSettings): void {
  const root = document.documentElement;
  if (!hasResolvedCustomLogo(settings)) {
    delete root.dataset.ytrCustomLogoState;
    disconnectLogoStateObserver();
    return;
  }

  if (settings.hideLogoAnimation) {
    root.dataset.ytrCustomLogoState = 'custom';
    syncCustomLogoMediaPlayback('custom');
    disconnectLogoStateObserver();
    return;
  }

  ensureLogoStateObserver();
  const nextState = hasActiveEventLogo() ? 'event' : 'custom';
  root.dataset.ytrCustomLogoState = nextState;
  syncCustomLogoMediaPlayback(nextState);
}

function syncCustomLogoElement(settings: Settings | null = currentSettings): void {
  const logoLink = document.querySelector('ytd-topbar-logo-renderer a#logo') as HTMLAnchorElement | null;
  if (!logoLink) return;

  const existingSlot = logoLink.querySelector('.ytr-custom-logo-slot') as HTMLSpanElement | null;
  const resolvedLogoKind = getResolvedLogoKind(settings);
  const resolvedLogoSource = getResolvedLogoSource(settings);
  const resolvedLogoRatio = getResolvedLogoRatio(settings);

  if (!resolvedLogoKind) {
    existingSlot?.remove();
    syncCustomLogoState(settings);
    return;
  }

  if (existingSlot) {
    existingSlot.style.setProperty('--ytr-custom-logo-ratio', String(resolvedLogoRatio));
  }
  if (resolvedLogoKind === 'rewind' && existingSlot?.dataset.ytrLogoKind === 'rewind') {
    syncCustomLogoState(settings);
    return;
  }

  const currentMedia = existingSlot?.querySelector('.ytr-custom-logo-media') as (HTMLImageElement | HTMLVideoElement) | null;
  if (resolvedLogoKind === 'custom' && currentMedia?.dataset.src === resolvedLogoSource) {
    syncCustomLogoState(settings);
    return;
  }

  existingSlot?.remove();

  const slot = document.createElement('span');
  slot.className = 'ytr-custom-logo-slot';
  slot.dataset.ytrLogoKind = resolvedLogoKind;
  slot.style.setProperty('--ytr-custom-logo-ratio', String(resolvedLogoRatio));

  if (resolvedLogoKind === 'rewind') {
    const rewindLogo = document.createElement('span');
    rewindLogo.className = 'ytr-custom-logo-rewind';
    rewindLogo.setAttribute('aria-hidden', 'true');
    slot.appendChild(rewindLogo);
  } else if (resolvedLogoSource && isVideoLogo(resolvedLogoSource)) {
    const video = document.createElement('video');
    video.className = 'ytr-custom-logo-media';
    video.dataset.src = resolvedLogoSource;
    video.src = resolvedLogoSource;
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    slot.appendChild(video);
    setTimeout(() => {
      void video.play().catch(() => {});
    }, 0);
  } else if (resolvedLogoSource) {
    const img = document.createElement('img');
    img.className = 'ytr-custom-logo-media';
    img.dataset.src = resolvedLogoSource;
    img.src = resolvedLogoSource;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    slot.appendChild(img);
  }

  logoLink.appendChild(slot);
  syncCustomLogoState(settings);
}

function syncCustomLogoMediaPlayback(state: 'custom' | 'event'): void {
  const media = document.querySelector('ytd-topbar-logo-renderer a#logo .ytr-custom-logo-media') as HTMLVideoElement | HTMLImageElement | null;
  if (!(media instanceof HTMLVideoElement)) return;

  if (state === 'event') {
    media.pause();
    return;
  }

  void media.play().catch(() => {});
}

function clearScheduledTimers(timers: number[]): void {
  timers.forEach((timer) => clearTimeout(timer));
}

function scheduleCustomLogoSync(delays: number | number[] = 0): void {
  clearScheduledTimers(customLogoSyncTimers);
  if (!hasResolvedCustomLogo(currentSettings)) {
    customLogoSyncTimers = [];
    syncCustomLogoElement();
    return;
  }
  const queue = Array.isArray(delays) ? delays : [delays];
  customLogoSyncTimers = queue.map((delay) => window.setTimeout(() => syncCustomLogoElement(), delay));
}

function syncYouTubeLogoMetrics(): void {
  if (currentSettings?.logoVariant !== 'youtube') return;

  const logoLink = document.querySelector('ytd-topbar-logo-renderer a#logo') as HTMLElement | null;
  const logoIcon = logoLink?.querySelector('yt-icon#logo-icon, #logo-icon') as HTMLElement | null;
  if (!logoLink || !logoIcon) return;

  const linkRect = logoLink.getBoundingClientRect();
  const iconRect = logoIcon.getBoundingClientRect();
  const rootStyle = document.documentElement.style;

  if (linkRect.width > 0) {
    rootStyle.setProperty('--ytr-youtube-logo-base-link-width', `${linkRect.width}px`);
  }
  if (iconRect.width > 0) {
    rootStyle.setProperty('--ytr-youtube-logo-base-width', `${iconRect.width}px`);
  }
  if (iconRect.height > 0) {
    rootStyle.setProperty('--ytr-youtube-logo-base-height', `${iconRect.height}px`);
  }
}

function scheduleYouTubeLogoMetricSync(delays: number | number[] = 0): void {
  clearScheduledTimers(youtubeLogoMetricSyncTimers);
  if (currentSettings?.logoVariant !== 'youtube') {
    youtubeLogoMetricSyncTimers = [];
    return;
  }

  const queue = Array.isArray(delays) ? delays : [delays];
  youtubeLogoMetricSyncTimers = queue.map((delay) => window.setTimeout(syncYouTubeLogoMetrics, delay));
}

function syncRewindLogoTheme(settings: Settings | null = currentSettings): void {
  if (!settings) return;
  document.documentElement.style.setProperty('--ytr-rewind-logo-color', getRewindLogoColor(settings, getYoutubeThemeMode()));
}

function scheduleFeedRevealSync(delays: number | number[] = 0): void {
  clearScheduledTimers(feedRevealSyncTimers);
  if (document.documentElement.dataset.ytrBetaFeedMotion !== 'true') {
    feedRevealSyncTimers = [];
    syncFeedRevealObserver();
    return;
  }
  const queue = Array.isArray(delays) ? delays : [delays];
  feedRevealSyncTimers = queue.map((delay) => window.setTimeout(syncFeedRevealObserver, delay));
}

// --- Explore More Topics: tag sections by title text ---

const EXPLORE_KEYWORDS = [
  'explore more topics',
  'другие темы',
  'ещё больше тем',
  'обзор тем',
  'больше тем',
];

const PLAYABLES_KEYWORDS = [
  'playables',
  'игры',
];

function tagExploreSections(): void {
  if (!needsExploreTags()) return;
  document.querySelectorAll('ytd-rich-section-renderer').forEach((section) => {
    const text = (section.textContent || '').toLowerCase();
    setElementFlag(section, 'data-ytr-shorts-section', !!section.querySelector('ytd-rich-shelf-renderer[is-shorts], a[href^="/shorts"]'));
    setElementFlag(section, 'data-ytr-posts-section', !!section.querySelector('ytd-post-renderer'));
    setElementFlag(section, 'data-ytr-breaking-news-section', !!section.querySelector('ytd-breaking-news-section-renderer'));
    setElementFlag(section, 'data-ytr-latest-posts-section', !!section.querySelector('ytd-rich-shelf-renderer:not([is-shorts]) ytd-post-renderer'));
    setElementFlag(section, 'data-ytr-explore-topics',
      EXPLORE_KEYWORDS.some((kw) => text.includes(kw)) ||
      !!section.querySelector('ytd-feed-nudge-renderer, yt-chip-cloud-renderer, iron-selector#chips, yt-related-chip-cloud-renderer'));
    setElementFlag(section, 'data-ytr-playables',
      PLAYABLES_KEYWORDS.some((kw) => text.includes(kw)) ||
      !!section.querySelector('ytd-rich-shelf-renderer[is-playables], [aria-label*="Playables"], [aria-label*="playables"], a[href*="/playables"]'));
  });
}

// --- Sidebar: tag sections by content ---

function tagSidebarSections(): void {
  if (!needsSidebarTags()) return;
  document.querySelectorAll('ytd-guide-section-renderer').forEach((section) => {
    const isSubscriptions = !!section.querySelector('ytd-guide-collapsible-section-entry-renderer');
    const isYou = !!section.querySelector('a[href="/feed/history"], a[href="/feed/library"], a[href*="list=WL"], a[href*="list=LL"]');
    const isMoreYt = !!section.querySelector('a[href*="youtube.com/premium"], a[href*="/premium"], a[href*="music.youtube.com"], a[href*="/kids"]');
    const title = section.querySelector('#guide-section-title');
    const isExplore = !!title?.textContent?.trim() && !isSubscriptions && !isYou && !isMoreYt;

    setElementFlag(section, 'data-ytr-sidebar-subscriptions', isSubscriptions);
    setElementFlag(section, 'data-ytr-sidebar-you', isYou);
    setElementFlag(section, 'data-ytr-sidebar-more-yt', isMoreYt);
    setElementFlag(section, 'data-ytr-sidebar-explore', isExplore);
  });

  document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer').forEach((entry) => {
    const link = entry.querySelector('a');
    const title = (link?.getAttribute('title') || link?.textContent || '').trim().toLowerCase();
    const href = link?.getAttribute('href') || '';
    setElementFlag(entry, 'data-ytr-shorts-entry', href === '/shorts' || title === 'shorts');
    setElementFlag(entry, 'data-ytr-report-history-entry', href === '/reporthistory');
  });
}

// --- Action buttons: tag by aria-label ---

const ACTION_BUTTON_KEYWORDS: Record<string, string[]> = {
  share: ['share', 'поделиться', 'compartir', 'compartilhar', 'partager', 'teilen', 'paylaş', '共有', '공유', '分享'],
  download: ['download', 'скачать', 'descargar', 'baixar', 'télécharger', 'herunterladen', 'indir', 'ダウンロード', '다운로드', '下载', 'offline'],
  clip: ['clip', 'клип', 'recortar', 'recorte', 'extrait', 'schneiden', 'klip', 'クリップ', '클립', '剪辑', 'remix', 'ремикс'],
  thanks: ['thanks', 'спасибо', 'gracias', 'obrigado', 'merci', 'danke', 'teşekkür', 'ありがとう', '감사', '感谢', 'super thanks'],
  save: ['save', 'сохранить', 'guardar', 'salvar', 'enregistrer', 'speichern', 'kaydet', '保存', '저장', 'зберегти', 'playlist'],
};

function tagActionButtons(): void {
  if (!needsActionTags()) return;
  const containers = document.querySelectorAll('#top-level-buttons-computed, ytd-menu-renderer.ytd-watch-metadata');
  containers.forEach((container) => {
    container.querySelectorAll('yt-button-view-model:not([data-ytr-action]), ytd-button-renderer:not([data-ytr-action]), ytd-download-button-renderer:not([data-ytr-action])').forEach((btn) => {
      const label = (btn.getAttribute('aria-label') || btn.querySelector('button')?.getAttribute('aria-label') || btn.textContent || '').toLowerCase();
      for (const [action, keywords] of Object.entries(ACTION_BUTTON_KEYWORDS)) {
        if (keywords.some((kw) => label.includes(kw))) {
          btn.setAttribute('data-ytr-action', action);
          return;
        }
      }
    });
  });
}

// --- Feed items: tag live, upcoming, mixes, podcasts, songs ---

const UPCOMING_KEYWORDS = ['scheduled for', 'notify me', 'напомнить', 'запланирован на'];
const PODCAST_KEYWORDS = ['episodes', 'episode', 'view full podcast', 'эпизодов', 'эпизод', 'подкаст', 'episodios', 'episódios', 'épisodes', 'episoden', 'bölüm', 'エピソード', '에피소드', '集'];

// Only scan untagged items (skip already-processed ones)
const FEED_ITEM_SELECTOR = 'ytd-rich-item-renderer:not([data-ytr-scanned]), ytd-video-renderer:not([data-ytr-scanned]), ytd-compact-video-renderer:not([data-ytr-scanned]), ytd-grid-video-renderer:not([data-ytr-scanned])';
const FEED_REVEAL_SELECTOR = 'ytd-browse[page-subtype="home"] ytd-rich-item-renderer, ytd-browse[page-subtype="home"] ytd-video-renderer, ytd-browse[page-subtype="home"] ytd-compact-video-renderer, ytd-browse[page-subtype="home"] ytd-grid-video-renderer';

function ensureFeedRevealObserver(): IntersectionObserver {
  if (feedRevealObserver) return feedRevealObserver;

  feedRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const item = entry.target as HTMLElement;
      if (entry.isIntersecting) {
        if (item.getAttribute('data-ytr-feed-reveal') === 'visible') {
          feedRevealObserver?.unobserve(item);
          return;
        }
        item.setAttribute('data-ytr-feed-reveal', 'pending');
        requestAnimationFrame(() => {
          item.setAttribute('data-ytr-feed-reveal', 'visible');
          feedRevealObserver?.unobserve(item);
        });
      }
    });
  }, {
    threshold: 0.04,
    rootMargin: '10% 0px 10% 0px',
  });

  return feedRevealObserver;
}

function syncFeedRevealObserver(): void {
  const items = document.querySelectorAll(FEED_REVEAL_SELECTOR);
  const enabled = document.documentElement.dataset.ytrBetaFeedMotion === 'true';

  if (!enabled) {
    feedRevealObserver?.disconnect();
    feedRevealObserver = null;
    items.forEach((item) => {
      item.removeAttribute('data-ytr-feed-reveal');
      (item as HTMLElement).style.removeProperty('--ytr-feed-reveal-delay');
    });
    return;
  }

  if (items.length === 0) {
    feedRevealObserver?.disconnect();
    feedRevealObserver = null;
    document.querySelectorAll('[data-ytr-feed-reveal]').forEach((item) => {
      item.removeAttribute('data-ytr-feed-reveal');
      (item as HTMLElement).style.removeProperty('--ytr-feed-reveal-delay');
    });
    return;
  }

  const observer = ensureFeedRevealObserver();
  items.forEach((item, index) => {
    const element = item as HTMLElement;
    if (element.getAttribute('data-ytr-feed-reveal') === 'visible') return;
    element.style.setProperty('--ytr-feed-reveal-delay', `${Math.min(index % 5, 4) * 18}ms`);
    if (!element.hasAttribute('data-ytr-feed-reveal')) {
      element.setAttribute('data-ytr-feed-reveal', 'pending');
    }
    observer.observe(element);
  });
}

function tagSearchShelves(): void {
  const d = document.documentElement.dataset;
  if (d.ytrHideSearchPeopleWatched !== 'true') return;
  if (!document.querySelector('ytd-search')) return;
  document.querySelectorAll('ytd-search ytd-shelf-renderer').forEach((shelf) => {
    const hasChannelLink = !!shelf.querySelector('a[href*="/@"], a[href*="/channel/"]');
    setElementFlag(shelf, 'data-ytr-search-people-watched', !hasChannelLink);
  });
}

function tagSimpleBadges(): void {
  if (document.documentElement.dataset.ytrHideNewBadge !== 'true') return;
  if (!document.querySelector('ytd-badge-supported-renderer')) return;
  document.querySelectorAll('ytd-badge-supported-renderer').forEach((badge) => {
    setElementFlag(badge, 'data-ytr-simple-badge', !!badge.querySelector('.badge-style-type-simple'));
  });
}

function tagFeedItems(): void {
  if (!needsFeedTags()) {
    syncFeedRevealObserver();
    return;
  }
  const items = document.querySelectorAll(FEED_ITEM_SELECTOR);
  if (items.length === 0) {
    tagSearchShelves();
    tagSimpleBadges();
    syncFeedRevealObserver();
    fixAvatarLiveLinks();
    return;
  }

  items.forEach((item) => {
    item.setAttribute('data-ytr-scanned', '');

    // Live streams — type-based only
    if (item.querySelector(
      'ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"], ' +
      '.badge-style-type-live-now, .badge-style-type-live-now-alt'
    )) {
      item.setAttribute('data-ytr-live', 'true');
    }

    // Upcoming / Premieres
    if (item.querySelector('ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]')) {
      item.setAttribute('data-ytr-upcoming', 'true');
    }

    // Mixes
    if (item.querySelector('ytd-radio-renderer, ytd-compact-radio-renderer')) {
      item.setAttribute('data-ytr-mix', 'true');
    }

    if (item.matches('ytd-video-renderer')) {
      setElementFlag(item, 'data-ytr-short-result', !!item.querySelector('a[href^="/shorts"]'));
    }
  });

  tagSearchShelves();
  tagSimpleBadges();
  syncFeedRevealObserver();
  fixAvatarLiveLinks();
}

// --- Avatar: fix live redirect on avatar clicks ---

let avatarClickListenerAdded = false;
const AVATAR_LIVE_LINK_SELECTOR = 'a[href*="/watch?v="]:not([data-ytr-live-fixed]), a[href*="/live/"]:not([data-ytr-live-fixed])';

function fixAvatarLiveLinks(): void {
  if (document.documentElement.dataset.ytrDisableAvatarLive !== 'true') return;

  // Fix href attributes on avatar links pointing to streams
  document.querySelectorAll(AVATAR_LIVE_LINK_SELECTOR).forEach((link) => {
    if (!link.querySelector('yt-avatar-shape, yt-img-shadow, img.yt-core-image')) return;
    const href = link.getAttribute('href') || '';
    if (!href.includes('/watch?v=') && !href.includes('/live/')) return;

    link.setAttribute('data-ytr-live-fixed', 'true');

    const container = link.closest(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ' +
      'ytd-video-owner-renderer, ytd-channel-renderer, #owner'
    );
    if (container) {
      const channelLink = container.querySelector(
        'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"]'
      );
      if (channelLink) {
        link.setAttribute('href', channelLink.getAttribute('href') || '');
      }
    }
  });

  // Intercept clicks on avatar links — YouTube may use JS navigation
  if (!avatarClickListenerAdded) {
    avatarClickListenerAdded = true;
    document.addEventListener('click', (e) => {
      if (document.documentElement.dataset.ytrDisableAvatarLive !== 'true') return;
      const avatar = (e.target as HTMLElement).closest('a');
      if (!avatar) return;
      const href = avatar.getAttribute('href') || '';
      if (!href.includes('/watch?v=') && !href.includes('/live/')) return;
      if (!avatar.querySelector('yt-avatar-shape, yt-img-shadow, img.yt-core-image')) return;

      // Find channel URL and redirect there instead
      const container = avatar.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ' +
        'ytd-video-owner-renderer, ytd-channel-renderer, #owner'
      );
      if (container) {
        const channelLink = container.querySelector(
          'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"]'
        );
        if (channelLink) {
          e.preventDefault();
          e.stopPropagation();
          const channelUrl = channelLink.getAttribute('href') || '';
          window.location.href = channelUrl;
        }
      }
    }, true);
  }
}


// --- Prefetch: trigger YouTube's lazy loading earlier when videosPerRow > default ---

let prefetchActive = false;

function isBalancedPrefetchEnabled(): boolean {
  return getHomeFeedColumns() > 0;
}

function getHomeGridRoot(): HTMLElement | null {
  return document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer:not(ytd-rich-section-renderer *) > #contents') as HTMLElement | null;
}

function getHomeFeedColumns(): number {
  const value = Number.parseInt(document.documentElement.dataset.ytrVideosPerRow || '', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getHomeFeedItemCount(): number {
  return document.querySelectorAll('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer:not(ytd-rich-section-renderer *) > #contents > ytd-rich-item-renderer').length;
}

function getContinuationItem(): HTMLElement | null {
  return document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer:not(ytd-rich-section-renderer *) > #contents > ytd-continuation-item-renderer') as HTMLElement | null
    ?? document.querySelector('ytd-continuation-item-renderer') as HTMLElement | null;
}

function ensurePrefetchObserverRoot(): void {
  const root = getHomeGridRoot();
  if (root === prefetchObservedRoot) return;
  prefetchMutationObserver?.disconnect();
  prefetchObservedRoot = root;
  if (root && prefetchMutationObserver) {
    prefetchMutationObserver.observe(root, { childList: true });
  }
}

function resetPrefetchTracking(): void {
  prefetchBurstCount = 0;
  prefetchLastFeedCount = 0;
  prefetchLastResizeSignal = 0;
  prefetchLastRequestedCount = 0;
  prefetchLastViewportResizeAt = 0;
}

function teardownPrefetch(): void {
  prefetchMutationObserver?.disconnect();
  prefetchMutationObserver = null;
  prefetchObservedRoot = null;

  if (prefetchRetryTimer !== null) {
    window.clearTimeout(prefetchRetryTimer);
    prefetchRetryTimer = null;
  }

  if (prefetchRaf) {
    window.cancelAnimationFrame(prefetchRaf);
    prefetchRaf = 0;
  }

  if (prefetchScrollHandler) {
    window.removeEventListener('scroll', prefetchScrollHandler);
    prefetchScrollHandler = null;
  }

  if (prefetchResizeHandler) {
    window.removeEventListener('resize', prefetchResizeHandler);
    prefetchResizeHandler = null;
  }

  if (prefetchNavigateHandler) {
    document.removeEventListener('yt-navigate-finish', prefetchNavigateHandler);
    prefetchNavigateHandler = null;
  }

  prefetchActive = false;
  resetPrefetchTracking();
}

function schedulePrefetchCheck(delay = 0): void {
  if (!isBalancedPrefetchEnabled()) return;
  if (prefetchRetryTimer !== null) {
    window.clearTimeout(prefetchRetryTimer);
  }
  prefetchRetryTimer = window.setTimeout(() => {
    prefetchRetryTimer = null;
    runPrefetchCheck();
  }, delay);
}

function queuePrefetchCheck(): void {
  if (!isBalancedPrefetchEnabled()) return;
  if (!document.querySelector('ytd-browse[page-subtype="home"]')) return;
  if (prefetchRaf) return;
  prefetchRaf = window.requestAnimationFrame(() => {
    prefetchRaf = 0;
    runPrefetchCheck();
  });
}

function runPrefetchCheck(): void {
  if (document.hidden) return;
  if (!isBalancedPrefetchEnabled()) return;
  if (!document.querySelector('ytd-browse[page-subtype="home"]')) return;
  if (Date.now() - prefetchLastViewportResizeAt < 1400) return;
  ensurePrefetchObserverRoot();
  if (!prefetchObservedRoot) return;
  const columns = getHomeFeedColumns();
  if (columns <= 0) return;

  const continuation = getContinuationItem();
  if (!continuation) return;

  const feedCount = getHomeFeedItemCount();
  const needsBalancedBatch = feedCount > 0 && feedCount % columns !== 0;
  const rect = continuation.getBoundingClientRect();
  const nearViewport = rect.top < window.innerHeight * (needsBalancedBatch ? 6 : 3.5);

  if (!nearViewport) return;

  const now = Date.now();
  const sameFeedCount = feedCount === prefetchLastRequestedCount;
  if (sameFeedCount && now - prefetchLastResizeSignal < 1200) return;

  prefetchLastResizeSignal = now;
  prefetchLastRequestedCount = feedCount;
  window.dispatchEvent(new Event('resize'));

  if (!needsBalancedBatch) {
    prefetchBurstCount = 0;
    prefetchLastFeedCount = feedCount;
    return;
  }

  prefetchBurstCount = feedCount === prefetchLastFeedCount ? prefetchBurstCount + 1 : 0;
  prefetchLastFeedCount = feedCount;

  if (prefetchBurstCount < 4) {
    schedulePrefetchCheck(140 + (prefetchBurstCount * 90));
  }
}

function setupPrefetch(): void {
  if (!isBalancedPrefetchEnabled()) return;
  if (prefetchActive) return;
  prefetchActive = true;
  prefetchMutationObserver = new MutationObserver(() => {
    schedulePrefetchCheck(120);
  });

  const resetPrefetchState = () => {
    resetPrefetchTracking();
    ensurePrefetchObserverRoot();
    schedulePrefetchCheck(220);
  };

  prefetchScrollHandler = () => queuePrefetchCheck();
  prefetchResizeHandler = () => {
    prefetchLastViewportResizeAt = Date.now();
  };
  prefetchNavigateHandler = resetPrefetchState;

  window.addEventListener('scroll', prefetchScrollHandler, { passive: true });
  window.addEventListener('resize', prefetchResizeHandler, { passive: true });
  document.addEventListener('yt-navigate-finish', prefetchNavigateHandler);

  ensurePrefetchObserverRoot();
  schedulePrefetchCheck(900);
  schedulePrefetchCheck(1600);
}

// --- Thumbnail: inject SVG pixelation filter ---

let pixelFilterInjected = false;

function injectPixelFilter(): void {
  if (pixelFilterInjected) return;
  pixelFilterInjected = true;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = `<defs><filter id="ytr-pixelate" x="0" y="0" width="1" height="1">
    <feFlood x="4" y="4" height="2" width="2"/>
    <feComposite width="10" height="10"/>
    <feTile result="a"/>
    <feComposite in="SourceGraphic" in2="a" operator="in"/>
    <feMorphology operator="dilate" radius="5"/>
  </filter></defs>`;
  document.documentElement.appendChild(svg);
}

// --- v0.5.0: Playback Speed Memory ---

let speedListenersSetup = false;
let speedAppliedForNav = false;
let playbackSpeedTimers: number[] = [];
let qualityListenersSetup = false;
let qualityDispatchTimers: number[] = [];

function setupPlaybackSpeed(s: Settings): void {
  playbackSpeedTimers.forEach((timer) => clearTimeout(timer));
  playbackSpeedTimers = [];
  if (s.playbackSpeed <= 0) return;

  const applySpeed = () => {
    if (speedAppliedForNav) return; // Already applied for this navigation — let user change freely
    const video = getMainVideoElement();
    if (!video || !currentSettings) return;
    const target = currentSettings.playbackSpeed;
    if (target > 0) {
      video.playbackRate = target;
      speedAppliedForNav = true;
    }
  };

  // Listen for SPA navigations — reset flag and apply speed for new page
  if (!speedListenersSetup) {
    speedListenersSetup = true;
    document.addEventListener('yt-navigate-finish', () => {
      playbackSpeedTimers.forEach((timer) => clearTimeout(timer));
      playbackSpeedTimers = [];
      speedAppliedForNav = false;
      playbackSpeedTimers.push(window.setTimeout(applySpeed, 900));
      playbackSpeedTimers.push(window.setTimeout(applySpeed, 2200));
    });
  }

  // Apply on initial load / settings change (reset flag so it applies once)
  speedAppliedForNav = false;
  playbackSpeedTimers.push(window.setTimeout(applySpeed, 360));
  playbackSpeedTimers.push(window.setTimeout(applySpeed, 1400));
}

function scheduleDefaultQualityDispatch(quality: string, delays: number[]): void {
  qualityDispatchTimers.forEach((timer) => clearTimeout(timer));
  qualityDispatchTimers = delays.map((delay) => window.setTimeout(() => {
    injectDefaultQualityBridge();
    dispatchDefaultQualityBridge(getEffectiveDefaultQuality(currentSettings) || quality);
  }, delay));
}

function setupDefaultQuality(s: Settings): void {
  const quality = getEffectiveDefaultQuality(s);
  if (quality === 'auto' && !qualityBridgeInjected) return;
  injectDefaultQualityBridge();
  scheduleDefaultQualityDispatch(quality, [40, 420, 1200, 2400]);

  if (qualityListenersSetup) return;
  qualityListenersSetup = true;

  const reapplyQuality = () => {
    const nextQuality = getEffectiveDefaultQuality(currentSettings);
    if (nextQuality === 'auto' && !qualityBridgeInjected) return;
    injectDefaultQualityBridge();
    scheduleDefaultQualityDispatch(nextQuality, [80, 560, 1500, 2600]);
  };

  document.addEventListener('yt-navigate-finish', reapplyQuality);
  document.addEventListener('yt-player-updated', reapplyQuality, true);
  document.addEventListener('yt-page-data-updated', reapplyQuality, true);
  document.addEventListener('play', reapplyQuality, true);
}

// --- v0.5.0: Watch Timer & Time Limit ---

let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerElement: HTMLElement | null = null;
let blockOverlay: HTMLElement | null = null;
let timerNavigationSetup = false;

async function updateTimerDisplay(): Promise<void> {
  const s = currentSettings;
  if (!s) return;

  const minutes = await getWatchTime();

  // Update timer display
  if (s.watchTimerEnabled) {
    if (!timerElement) {
      timerElement = document.createElement('div');
      timerElement.id = 'ytr-watch-timer';
      document.body.appendChild(timerElement);
    }
    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    timerElement.textContent = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

    if (s.watchTimeLimitMinutes > 0 && minutes >= s.watchTimeLimitMinutes * 0.8) {
      timerElement.setAttribute('data-ytr-timer-warn', 'true');
    } else {
      timerElement.removeAttribute('data-ytr-timer-warn');
    }
  }

  // Check time limit — works on all pages
  if (s.watchTimeLimitMinutes > 0 && minutes >= s.watchTimeLimitMinutes) {
    const dismissed = await getBlockDismissed();
    if (!dismissed && !blockOverlay) {
      showBlockOverlay(Math.floor(minutes));
    }
  } else if (blockOverlay) {
    blockOverlay.remove();
    blockOverlay = null;
    await setBlockDismissed(false); // Reset if limit is no longer exceeded
  }
}

function setupWatchTimer(s: Settings): void {
  // Clean up existing timer display if disabled
  if (!s.watchTimerEnabled && timerElement) {
    timerElement.remove();
    timerElement = null;
  }

  // Remove block overlay if limit is disabled
  if (s.watchTimeLimitMinutes <= 0 && blockOverlay) {
    blockOverlay.remove();
    blockOverlay = null;
  }

  if (!s.watchTimerEnabled && s.watchTimeLimitMinutes <= 0) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    return;
  }

  // Increment watch time every minute
  if (!timerInterval) {
    timerInterval = setInterval(async () => {
      if (!currentSettings?.watchTimerEnabled && !(currentSettings && currentSettings.watchTimeLimitMinutes > 0)) return;
      // Track time if tab is visible OR if a video is playing (background playback)
      const video = getMainVideoElement();
      const isVideoPlaying = video && !video.paused && !video.ended && video.readyState > 2;
      if (document.hidden && !isVideoPlaying) return;
      await addWatchTime(1);
      updateTimerDisplay();
    }, 60_000);
  }

  // Re-check on SPA navigation (works on all YT pages)
  if (!timerNavigationSetup) {
    timerNavigationSetup = true;
    document.addEventListener('yt-navigate-finish', () => {
      setTimeout(updateTimerDisplay, 500);
    });
  }

  // Immediate check (reacts to setting changes without reload)
  setTimeout(updateTimerDisplay, 500);
}

function showBlockOverlay(minutes: number): void {
  // Remove existing overlay before creating new one (for repeat mode)
  if (blockOverlay) {
    blockOverlay.remove();
    blockOverlay = null;
  }

  const isRu = getContentLocale() === 'ru';
  const limit = Math.max(currentSettings?.watchTimeLimitMinutes || minutes, 1);
  const progress = clamp(Math.round((minutes / limit) * 100), 0, 100);

  blockOverlay = document.createElement('div');
  blockOverlay.id = 'ytr-block-overlay';
  blockOverlay.innerHTML = `
    <div class="ytr-block-aura"></div>
    <div class="ytr-block-content">
      <div class="ytr-block-icon-shell">
        <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <div class="ytr-block-meta">
        <span class="ytr-block-pill">${minutes} ${isRu ? 'мин' : 'min'}</span>
        <span class="ytr-block-pill ytr-block-pill-progress">${progress}%</span>
      </div>
      <h2 class="ytr-block-title">${escapeHtml(isRu ? 'Дневной лимит достигнут' : 'Daily limit reached')}</h2>
      <p class="ytr-block-message">${escapeHtml(
        (isRu
          ? `Вы смотрите YouTube уже ${minutes} минут сегодня. Сделайте перерыв!`
          : `You've been watching YouTube for ${minutes} minutes today. Take a break!`
        )
      )}</p>
      <div class="ytr-block-footnote">${escapeHtml(
        isRu
          ? 'Изменить лимит можно в popup расширения'
          : 'You can change the limit in the extension popup'
      )}</div>
      <div class="ytr-block-actions">
        <button class="ytr-block-close">${escapeHtml(isRu ? 'Продолжить' : 'Continue anyway')}</button>
      </div>
    </div>
  `;

  blockOverlay.querySelector('.ytr-block-close')?.addEventListener('click', async () => {
    blockOverlay?.remove();
    blockOverlay = null;
    if (!currentSettings?.watchTimeLimitBlockRepeat) {
      // Non-repeat mode: persist dismissed for the rest of the day
      await setBlockDismissed(true);
    } else {
      // Repeat mode: dismiss temporarily, will re-show on next interval
      // Don't persist — let it show again next minute
    }
  });

  document.body.appendChild(blockOverlay);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Toast notification ---

function showYtrToast(message: string): void {
  const existing = document.querySelector('.ytr-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'ytr-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('ytr-toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('ytr-toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const GOOGLE_ICON_SVGS = {
  photoCamera: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M0 0h24v24H0V0z" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M20 4h-3.17l-1.24-1.35c-.37-.41-.91-.65-1.47-.65H9.88c-.56 0-1.1.24-1.48.65L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" fill="currentColor"/></svg>`,
  palette: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm5.5 11c-.83 0-1.5-.67-1.5-1.5S16.67 10 17.5 10 19 10.67 19 11.5 18.33 13 17.5 13zm-3-4C13.67 9 13 8.33 13 7.5S13.67 6 14.5 6 16 6.67 16 7.5 15.33 9 14.5 9zm-8 4C5.67 13 5 12.33 5 11.5S5.67 10 6.5 10 8 10.67 8 11.5 7.33 13 6.5 13zm3-4C8.67 9 8 8.33 8 7.5S8.67 6 9.5 6 11 6.67 11 7.5 10.33 9 9.5 9z" fill="currentColor"/></svg>`,
  colorize: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20.71 5.63 18.37 3.29c-.39-.39-1.02-.39-1.41 0l-3.12 3.12-1.23-1.21c-.39-.39-1.02-.38-1.41 0-.39.39-.39 1.02 0 1.41l.72.72-8.77 8.77c-.1.1-.15.22-.15.36v4.04c0 .28.22.5.5.5h4.04c.13 0 .26-.05.35-.15l8.77-8.77.72.72c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41l-1.22-1.22 3.12-3.12c.41-.4.41-1.03.02-1.42zM6.92 19 5 17.08l8.06-8.06 1.92 1.92L6.92 19z" fill="currentColor"/></svg>`,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type RgbColor = { r: number; g: number; b: number };
type HsvColor = { h: number; s: number; v: number };

function normalizeHexColor(value: string, fallback = '#ffffff'): string {
  const normalized = value.trim().replace(/^#?/, '#').toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function componentToHex(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
}

function rgbToHex(color: RgbColor): string {
  return `#${componentToHex(color.r)}${componentToHex(color.g)}${componentToHex(color.b)}`;
}

function hexToRgb(hex: string): RgbColor | null {
  const normalized = normalizeHexColor(hex, '');
  if (!normalized) return null;

  const parsed = Number.parseInt(normalized.slice(1), 16);
  if (Number.isNaN(parsed)) return null;

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function parseRgbChannels(value: string): RgbColor | null {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;

  const parts = match[1]
    .split(',')
    .slice(0, 3)
    .map((part) => Number.parseFloat(part.trim()));

  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;

  return {
    r: clamp(parts[0], 0, 255),
    g: clamp(parts[1], 0, 255),
    b: clamp(parts[2], 0, 255),
  };
}

function rgbToHsl(color: RgbColor): { h: number; s: number; l: number } {
  const red = clamp(color.r / 255, 0, 1);
  const green = clamp(color.g / 255, 0, 1);
  const blue = clamp(color.b / 255, 0, 1);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }

  return {
    h: ((hue * 60) + 360) % 360,
    s: saturation,
    l: lightness,
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  let normalized = t;
  if (normalized < 0) normalized += 1;
  if (normalized > 1) normalized -= 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
}

function hexFromHsl(hue: number, saturation: number, lightness: number): string {
  const normalizedHue = ((hue % 360) + 360) % 360 / 360;
  const normalizedSaturation = clamp(saturation, 0, 100) / 100;
  const normalizedLightness = clamp(lightness, 0, 100) / 100;

  if (normalizedSaturation === 0) {
    const channel = normalizedLightness * 255;
    return rgbToHex({ r: channel, g: channel, b: channel });
  }

  const q = normalizedLightness < 0.5
    ? normalizedLightness * (1 + normalizedSaturation)
    : normalizedLightness + normalizedSaturation - normalizedLightness * normalizedSaturation;
  const p = 2 * normalizedLightness - q;

  return rgbToHex({
    r: hueToRgb(p, q, normalizedHue + 1 / 3) * 255,
    g: hueToRgb(p, q, normalizedHue) * 255,
    b: hueToRgb(p, q, normalizedHue - 1 / 3) * 255,
  });
}

function mixHexColors(first: string, second: string, ratio = 0.5): string {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  if (!a || !b) return first;

  const weight = clamp(ratio, 0, 1);
  return rgbToHex({
    r: a.r * weight + b.r * (1 - weight),
    g: a.g * weight + b.g * (1 - weight),
    b: a.b * weight + b.b * (1 - weight),
  });
}

function normalizeThemeSeedColor(color: string): string {
  const rgb = hexToRgb(normalizeHexColor(color, DEFAULT_SETTINGS.interfaceThemeColor));
  if (!rgb) return DEFAULT_SETTINGS.interfaceThemeColor;

  const original = rgbToHex(rgb).toLowerCase();
  const hsl = rgbToHsl(rgb);
  if (hsl.s >= 0.06 && hsl.l >= 0.22 && hsl.l <= 0.92) {
    return original;
  }

  const saturation = hsl.s < 0.06 ? 0.08 : hsl.s;
  const lightness = clamp(hsl.l, 0.22, 0.92);
  return hexFromHsl(hsl.h, saturation * 100, lightness * 100);
}

function sanitizeThemeSeedColor(mode: ResolvedThemeMode, color: string): string {
  const rgb = hexToRgb(normalizeThemeSeedColor(color));
  if (!rgb) return DEFAULT_SETTINGS.interfaceThemeColor;

  const hsl = rgbToHsl(rgb);
  const saturation = hsl.s < 0.08 ? 0.18 : hsl.s;
  const lightness = mode === 'dark'
    ? clamp(hsl.l, 0.58, 0.92)
    : clamp(hsl.l, 0.16, 0.9);

  return hexFromHsl(hsl.h, saturation * 100, lightness * 100);
}

function getThemePrimaryColor(mode: ResolvedThemeMode, seedColor: string): string {
  const rgb = hexToRgb(seedColor) || hexToRgb(DEFAULT_SETTINGS.interfaceThemeColor);
  if (!rgb) return DEFAULT_SETTINGS.interfaceThemeColor;

  const { h, s } = rgbToHsl(rgb);
  if (mode === 'light') {
    return hexFromHsl(h, clamp(s * 100 * 0.46, 34, 56), 40);
  }

  return sanitizeThemeSeedColor('dark', seedColor);
}

function getRelativeLuminance(color: RgbColor): number {
  const normalizeChannel = (value: number): number => {
    const channel = clamp(value, 0, 255) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * normalizeChannel(color.r) +
    0.7152 * normalizeChannel(color.g) +
    0.0722 * normalizeChannel(color.b)
  );
}

function getYoutubeThemeMode(): ResolvedThemeMode {
  const html = document.documentElement;
  if (html.hasAttribute('dark')) return 'dark';

  const app = document.querySelector('ytd-app') as HTMLElement | null;
  if (app?.hasAttribute('dark')) return 'dark';

  const elements = [app, document.body, html].filter(Boolean) as HTMLElement[];
  for (const element of elements) {
    const styles = window.getComputedStyle(element);
    const candidates = [
      styles.getPropertyValue('--yt-spec-base-background'),
      styles.getPropertyValue('--yt-spec-brand-background-primary'),
      styles.getPropertyValue('--yt-spec-general-background-a'),
      styles.backgroundColor,
    ];

    for (const candidate of candidates) {
      if (/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(candidate.trim())) {
        continue;
      }
      const parsed = parseRgbChannels(candidate) || hexToRgb(candidate.trim());
      if (!parsed) continue;
      return getRelativeLuminance(parsed) < 0.42 ? 'dark' : 'light';
    }
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

function getRewindLogoColor(settings: Settings | null, mode: ResolvedThemeMode): string {
  const seedColor = normalizeHexColor(settings?.interfaceThemeColor || DEFAULT_SETTINGS.interfaceThemeColor, DEFAULT_SETTINGS.interfaceThemeColor);
  const accentSeed = sanitizeThemeSeedColor(mode, seedColor);
  const primary = getThemePrimaryColor(mode, accentSeed);
  return mode === 'light'
    ? mixHexColors(primary, '#6a6675', 0.44)
    : mixHexColors(accentSeed, '#d7d3e5', 0.42);
}

function rgbToHsv(color: RgbColor): HsvColor {
  const r = clamp(color.r / 255, 0, 1);
  const g = clamp(color.g / 255, 0, 1);
  const b = clamp(color.b / 255, 0, 1);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta > 0) {
    if (max === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      hue = 60 * (((b - r) / delta) + 2);
    } else {
      hue = 60 * (((r - g) / delta) + 4);
    }
  }

  if (hue < 0) hue += 360;

  return {
    h: hue,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToRgb(color: HsvColor): RgbColor {
  const hue = ((color.h % 360) + 360) % 360;
  const saturation = clamp(color.s, 0, 1);
  const value = clamp(color.v, 0, 1);
  const chroma = value * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment >= 0 && segment < 1) {
    red = chroma;
    green = x;
  } else if (segment < 2) {
    red = x;
    green = chroma;
  } else if (segment < 3) {
    green = chroma;
    blue = x;
  } else if (segment < 4) {
    green = x;
    blue = chroma;
  } else if (segment < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data = ''] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] || 'image/png';
  const decoded = atob(data);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function resolveImageBlob(src: string): Promise<Blob> {
  if (src.startsWith('data:')) {
    return dataUrlToBlob(src);
  }

  const response = await fetch(src, {
    credentials: 'omit',
    cache: 'force-cache',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.blob();
}

async function renderBlobToPng(blob: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not decode image'));
      image.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.drawImage(img, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('Could not export image'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function copyImageToClipboard(src: string): Promise<'image' | 'link' | 'failed'> {
  if (!navigator.clipboard) return 'failed';

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      const pngBlobPromise = resolveImageBlob(src).then((sourceBlob) =>
        sourceBlob.type === 'image/png' ? sourceBlob : renderBlobToPng(sourceBlob)
      );
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlobPromise })]);
      return 'image';
    }
  } catch {}

  try {
    await navigator.clipboard.writeText(src);
    return 'link';
  } catch {
    return 'failed';
  }
}

function buildScreenshotFilename(videoId: string): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `frame-${videoId}-${stamp}.png`;
}

async function triggerDownload(src: string, filename: string): Promise<void> {
  let downloadUrl = src;
  let shouldRevoke = false;

  try {
    if (src.startsWith('data:')) {
      downloadUrl = URL.createObjectURL(dataUrlToBlob(src));
      shouldRevoke = true;
    } else {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      downloadUrl = URL.createObjectURL(blob);
      shouldRevoke = true;
    }
  } catch {
    if (!(src.startsWith('data:') || src.startsWith('blob:'))) {
      const fallbackLink = document.createElement('a');
      fallbackLink.href = src;
      fallbackLink.download = filename;
      fallbackLink.rel = 'noopener';
      fallbackLink.click();
      return;
    }
  }

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  requestAnimationFrame(() => {
    link.remove();
    if (shouldRevoke) {
      URL.revokeObjectURL(downloadUrl);
    }
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//.test(src)) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode image'));
    image.src = src;
  });
}

function getImageFingerprint(image: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 12;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const luminance: number[] = [];
    let total = 0;

    for (let i = 0; i < data.length; i += 4) {
      const value = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      luminance.push(value);
      total += value;
    }

    const threshold = total / luminance.length;
    return luminance.map((value) => (value >= threshold ? '1' : '0')).join('');
  } catch {
    return null;
  }
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function getVisibleVideoRect(video: HTMLVideoElement): DOMRect | null {
  const rect = video.getBoundingClientRect();
  const left = clamp(rect.left, 0, window.innerWidth);
  const top = clamp(rect.top, 0, window.innerHeight);
  const right = clamp(rect.right, 0, window.innerWidth);
  const bottom = clamp(rect.bottom, 0, window.innerHeight);
  const width = right - left;
  const height = bottom - top;

  if (width < 4 || height < 4) return null;
  return new DOMRect(left, top, width, height);
}

async function captureVisibleTab(): Promise<string> {
  const response = await browser.runtime.sendMessage({
    type: 'ytr_capture_visible_tab',
  }) as CaptureVisibleTabResponse;

  if (!response?.dataUrl) {
    throw new Error(response?.error || 'Could not capture visible tab');
  }

  return response.dataUrl;
}

async function captureRawVideoFrame(video: HTMLVideoElement): Promise<string> {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
    throw new Error('Video frame is not ready');
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

async function cropDataUrlToRect(dataUrl: string, rect: DOMRect): Promise<string> {
  const image = await loadImage(dataUrl);
  const scaleX = image.naturalWidth / window.innerWidth;
  const scaleY = image.naturalHeight / window.innerHeight;

  const cropX = Math.max(0, Math.round(rect.x * scaleX));
  const cropY = Math.max(0, Math.round(rect.y * scaleY));
  const cropWidth = Math.max(1, Math.round(rect.width * scaleX));
  const cropHeight = Math.max(1, Math.round(rect.height * scaleY));

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return canvas.toDataURL('image/png');
}

async function captureCurrentVideoFrame(videoId: string): Promise<{ dataUrl: string; filename: string }> {
  const video = getMainVideoElement();
  if (!video) {
    throw new Error('Video element not found');
  }

  try {
    const dataUrl = await captureRawVideoFrame(video);
    return {
      dataUrl,
      filename: buildScreenshotFilename(videoId),
    };
  } catch (error) {
    console.warn('[YouTube Rewind] Direct frame capture failed, falling back to clean tab capture', error);
  }

  const rect = getVisibleVideoRect(video);
  if (!rect) {
    throw new Error('Video is outside the viewport');
  }

  document.documentElement.dataset.ytrCleanVideoCapture = 'true';

  try {
    await waitForAnimationFrame();
    await waitForAnimationFrame();
    const tabCapture = await captureVisibleTab();
    const dataUrl = await cropDataUrlToRect(tabCapture, rect);
    return {
      dataUrl,
      filename: buildScreenshotFilename(videoId),
    };
  } finally {
    delete document.documentElement.dataset.ytrCleanVideoCapture;
  }
}

// --- Image overlay (shared by thumbnail preview + screenshot) ---

function renderOverlayStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: OverlayStroke[],
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    if (!stroke.points.length) continue;

    const size = Math.max(1, stroke.sizeRatio * Math.min(width, height));
    ctx.save();
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = size;

    const first = {
      x: stroke.points[0].x * width,
      y: stroke.points[0].y * height,
    };

    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(first.x, first.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const point of stroke.points.slice(1)) {
      ctx.lineTo(point.x * width, point.y * height);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

async function buildOverlayExportDataUrl(item: OverlayGalleryItem, strokes: OverlayStroke[]): Promise<string> {
  if (!strokes.length) return item.src;

  const image = await loadImage(item.src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
  const overlayCtx = overlayCanvas.getContext('2d');
  if (!overlayCtx) throw new Error('Canvas unavailable');

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  renderOverlayStrokes(overlayCtx, strokes, canvas.width, canvas.height);
  ctx.drawImage(overlayCanvas, 0, 0);
  return canvas.toDataURL('image/png');
}

type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
};

function showYtrConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const existing = document.querySelector('.ytr-confirm');
  if (existing) existing.remove();

  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'ytr-confirm';
    root.innerHTML = `
      <div class="ytr-confirm-backdrop"></div>
      <div class="ytr-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="ytr-confirm-title" aria-describedby="ytr-confirm-message">
        <div class="ytr-confirm-title" id="ytr-confirm-title">${escapeHtml(options.title)}</div>
        <div class="ytr-confirm-message" id="ytr-confirm-message">${escapeHtml(options.message)}</div>
        <div class="ytr-confirm-actions">
          <button type="button" class="ytr-confirm-btn ytr-confirm-btn-secondary">${escapeHtml(options.cancelText)}</button>
          <button type="button" class="ytr-confirm-btn ytr-confirm-btn-primary">${escapeHtml(options.confirmText)}</button>
        </div>
      </div>
    `;

    const finish = (value: boolean) => {
      root.remove();
      document.removeEventListener('keydown', onKeyDown, true);
      resolve(value);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
      if (event.key === 'Enter') {
        const target = document.activeElement as HTMLElement | null;
        if (target?.classList.contains('ytr-confirm-btn-secondary')) return;
        event.preventDefault();
        finish(true);
      }
    };

    root.querySelector('.ytr-confirm-backdrop')?.addEventListener('click', () => finish(false));
    root.querySelector('.ytr-confirm-btn-secondary')?.addEventListener('click', () => finish(false));
    root.querySelector('.ytr-confirm-btn-primary')?.addEventListener('click', () => finish(true));

    document.body.appendChild(root);
    document.addEventListener('keydown', onKeyDown, true);
    (root.querySelector('.ytr-confirm-btn-primary') as HTMLButtonElement | null)?.focus();
  });
}

function showImageOverlay(
  imgSrc: string,
  filename: string,
  galleryItems: OverlayGalleryItem[] = [{ src: imgSrc, filename, label: '1' }],
  startIndex = 0,
  options: OverlayOptions = {},
): void {
  activeOverlayCleanup?.();
  const existing = document.querySelector('#ytr-thumb-overlay');
  if (existing) {
    existing.remove();
    document.documentElement.classList.remove('ytr-overlay-lock-scroll');
  }
  closeAllYtrMenus();

  const isRu = getContentLocale() === 'ru';
  const allowDrawing = !!options.drawing;
  const items = galleryItems.length ? galleryItems : [{ src: imgSrc, filename, label: '1' }];
  let currentIndex = clamp(startIndex, 0, items.length - 1);
  const iconStrokeAttrs = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  const DRAW_ICONS = {
    drawMode: `<svg viewBox="0 0 24 24" width="20" height="20" ${iconStrokeAttrs}><path d="M4 19.5V16.75L14.2 6.58a1.5 1.5 0 0 1 2.12 0l1.1 1.1a1.5 1.5 0 0 1 0 2.12L7.25 20H4Zm11.7-11.85 1.72 1.72"/><path d="M13.5 7.3 16.7 4.1a2 2 0 0 1 2.83 0l.37.37a2 2 0 0 1 0 2.83L16.7 10.5"/></svg>`,
    pencil: `<svg viewBox="0 0 24 24" width="20" height="20" ${iconStrokeAttrs}><path d="M4 20h3.3l9.85-9.85-3.3-3.3L4 16.7V20Z"/><path d="m13.85 6.85 3.3 3.3"/><path d="m11 20 4-1"/></svg>`,
    eraser: `<svg viewBox="0 0 24 24" width="20" height="20" ${iconStrokeAttrs}><path d="m7 15.5 7.85-7.85a2 2 0 0 1 2.83 0l1.82 1.82a2 2 0 0 1 0 2.83L14.3 17.5a2 2 0 0 1-1.41.59H8.41A2 2 0 0 1 7 17.5l-1.5-1.5a2 2 0 0 1 0-2.83L9.3 9.35"/><path d="M11 18h8"/></svg>`,
    clear: `<svg viewBox="0 0 24 24" width="20" height="20" ${iconStrokeAttrs}><path d="M5 7h14"/><path d="M9 7V5.8c0-.99.81-1.8 1.8-1.8h2.4c.99 0 1.8.81 1.8 1.8V7"/><path d="m7 7 1 11a2 2 0 0 0 2 1.82h4a2 2 0 0 0 2-1.82L17 7"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>`,
    undo: `<svg viewBox="0 0 24 24" width="20" height="20" ${iconStrokeAttrs}><path d="M9 7 4 12l5 5"/><path d="M20 18a7 7 0 0 0-7-7H4"/></svg>`,
    redo: `<svg viewBox="0 0 24 24" width="20" height="20" ${iconStrokeAttrs}><path d="m15 7 5 5-5 5"/><path d="M4 18a7 7 0 0 1 7-7h9"/></svg>`,
  } as const;

  const overlay = document.createElement('div');
  overlay.id = 'ytr-thumb-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.tabIndex = -1;
  overlay.dataset.hasGallery = String(items.length > 1);

  const backdrop = document.createElement('div');
  backdrop.className = 'ytr-thumb-overlay-backdrop';

  const content = document.createElement('div');
  content.className = 'ytr-thumb-overlay-content';

  const stage = document.createElement('div');
  stage.className = 'ytr-thumb-overlay-stage';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'ytr-thumb-overlay-img-wrap';

  const mediaLayer = document.createElement('div');
  mediaLayer.className = 'ytr-thumb-overlay-media-layer';

  const stageStatus = document.createElement('div');
  stageStatus.className = 'ytr-thumb-overlay-status';
  stageStatus.textContent = isRu ? 'Загрузка превью…' : 'Loading preview…';

  const img = document.createElement('img');
  img.alt = '';
  img.className = 'ytr-thumb-overlay-img';
  img.draggable = false;
  img.decoding = 'async';

  const drawCanvas = document.createElement('canvas');
  drawCanvas.className = 'ytr-thumb-overlay-drawing';
  drawCanvas.hidden = !allowDrawing;

  const gallery = document.createElement('div');
  gallery.className = 'ytr-thumb-overlay-gallery';

  const galleryRow = document.createElement('div');
  galleryRow.className = 'ytr-thumb-overlay-gallery-row';

  const galleryViewport = document.createElement('div');
  galleryViewport.className = 'ytr-thumb-overlay-gallery-viewport';

  const galleryTrack = document.createElement('div');
  galleryTrack.className = 'ytr-thumb-overlay-gallery-track';

  const galleryPrev = document.createElement('button');
  galleryPrev.className = 'ytr-thumb-overlay-icon-btn ytr-thumb-overlay-gallery-arrow';
  galleryPrev.type = 'button';
  galleryPrev.setAttribute('aria-label', isRu ? 'Предыдущее превью' : 'Previous preview');
  galleryPrev.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;

  const galleryNext = document.createElement('button');
  galleryNext.className = 'ytr-thumb-overlay-icon-btn ytr-thumb-overlay-gallery-arrow';
  galleryNext.type = 'button';
  galleryNext.setAttribute('aria-label', isRu ? 'Следующее превью' : 'Next preview');
  galleryNext.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;

  const controls = document.createElement('div');
  controls.className = 'ytr-thumb-overlay-footer';

  const panel = document.createElement('div');
  panel.className = 'ytr-thumb-overlay-panel';

  const meta = document.createElement('div');
  meta.className = 'ytr-thumb-overlay-meta';

  const metaPill = document.createElement('div');
  metaPill.className = 'ytr-thumb-overlay-pill';

  const metaTitle = document.createElement('div');
  metaTitle.className = 'ytr-thumb-overlay-title';

  const viewControls = document.createElement('div');
  viewControls.className = 'ytr-thumb-overlay-view-controls';

  const actions = document.createElement('div');
  actions.className = 'ytr-thumb-overlay-actions';

  const drawControls = document.createElement('div');
  drawControls.className = 'ytr-thumb-overlay-draw-controls';
  drawControls.hidden = !allowDrawing;

  const brushSizeShell = document.createElement('div');
  brushSizeShell.className = 'ytr-thumb-overlay-brush-shell';

  const brushSizeValue = document.createElement('span');
  brushSizeValue.className = 'ytr-thumb-overlay-brush-value';

  const colorWrap = document.createElement('div');
  colorWrap.className = 'ytr-thumb-overlay-color-wrap';
  colorWrap.title = isRu ? 'Цвет кисти' : 'Brush color';

  const colorTrigger = document.createElement('button');
  colorTrigger.className = 'ytr-thumb-overlay-color-trigger';
  colorTrigger.type = 'button';
  colorTrigger.setAttribute('aria-label', isRu ? 'Выбрать цвет кисти' : 'Choose brush color');
  colorTrigger.setAttribute('aria-haspopup', 'dialog');
  colorTrigger.setAttribute('aria-expanded', 'false');

  const colorTriggerSwatch = document.createElement('span');
  colorTriggerSwatch.className = 'ytr-thumb-overlay-color-swatch';

  const colorTriggerIcon = document.createElement('span');
  colorTriggerIcon.className = 'ytr-thumb-overlay-color-trigger-icon';
  colorTriggerIcon.innerHTML = GOOGLE_ICON_SVGS.palette;

  const colorPanel = document.createElement('div');
  colorPanel.className = 'ytr-thumb-overlay-color-panel';
  colorPanel.hidden = true;

  const colorPanelHeader = document.createElement('div');
  colorPanelHeader.className = 'ytr-thumb-overlay-color-panel-header';

  const colorPanelTitle = document.createElement('div');
  colorPanelTitle.className = 'ytr-thumb-overlay-color-panel-title';
  colorPanelTitle.textContent = isRu ? 'Цвет кисти' : 'Brush color';

  const colorPanelValue = document.createElement('div');
  colorPanelValue.className = 'ytr-thumb-overlay-color-panel-value';

  const colorArea = document.createElement('div');
  colorArea.className = 'ytr-thumb-overlay-color-area';
  colorArea.setAttribute('role', 'slider');
  colorArea.setAttribute('aria-label', isRu ? 'Насыщенность и яркость' : 'Saturation and value');
  colorArea.tabIndex = 0;

  const colorAreaThumb = document.createElement('div');
  colorAreaThumb.className = 'ytr-thumb-overlay-color-area-thumb';
  colorArea.appendChild(colorAreaThumb);

  const colorHueRow = document.createElement('div');
  colorHueRow.className = 'ytr-thumb-overlay-color-hue-row';

  const colorHueIcon = document.createElement('span');
  colorHueIcon.className = 'ytr-thumb-overlay-color-hue-icon';
  colorHueIcon.innerHTML = GOOGLE_ICON_SVGS.palette;

  const colorHueInput = document.createElement('input');
  colorHueInput.className = 'ytr-thumb-overlay-color-hue';
  colorHueInput.type = 'range';
  colorHueInput.min = '0';
  colorHueInput.max = '360';
  colorHueInput.step = '1';
  colorHueInput.value = '0';
  colorHueInput.setAttribute('aria-label', isRu ? 'Оттенок' : 'Hue');

  const colorEyedropperBtn = document.createElement('button');
  colorEyedropperBtn.className = 'ytr-thumb-overlay-color-eye';
  colorEyedropperBtn.type = 'button';
  colorEyedropperBtn.title = isRu ? 'Пипетка (I или Alt + клик)' : 'Eyedropper (I or Alt + click)';
  colorEyedropperBtn.setAttribute('aria-label', colorEyedropperBtn.title);
  colorEyedropperBtn.innerHTML = GOOGLE_ICON_SVGS.colorize;

  colorHueRow.appendChild(colorHueIcon);
  colorHueRow.appendChild(colorHueInput);
  colorHueRow.appendChild(colorEyedropperBtn);

  const colorFooter = document.createElement('div');
  colorFooter.className = 'ytr-thumb-overlay-color-footer';

  const colorHexField = document.createElement('input');
  colorHexField.className = 'ytr-thumb-overlay-color-hex';
  colorHexField.type = 'text';
  colorHexField.inputMode = 'text';
  colorHexField.maxLength = 7;
  colorHexField.spellcheck = false;
  colorHexField.autocapitalize = 'characters';
  colorHexField.setAttribute('aria-label', isRu ? 'HEX-код цвета' : 'HEX color');

  const colorPresetRow = document.createElement('div');
  colorPresetRow.className = 'ytr-thumb-overlay-color-presets';

  const pencilBtn = document.createElement('button');
  pencilBtn.className = 'ytr-thumb-overlay-icon-btn';
  pencilBtn.type = 'button';
  pencilBtn.title = isRu ? 'Карандаш' : 'Pencil';
  pencilBtn.setAttribute('aria-label', isRu ? 'Карандаш' : 'Pencil');
  pencilBtn.innerHTML = DRAW_ICONS.pencil;

  const eraserBtn = document.createElement('button');
  eraserBtn.className = 'ytr-thumb-overlay-icon-btn';
  eraserBtn.type = 'button';
  eraserBtn.title = isRu ? 'Ластик' : 'Eraser';
  eraserBtn.setAttribute('aria-label', isRu ? 'Ластик' : 'Eraser');
  eraserBtn.innerHTML = DRAW_ICONS.eraser;

  const undoBtn = document.createElement('button');
  undoBtn.className = 'ytr-thumb-overlay-icon-btn';
  undoBtn.type = 'button';
  undoBtn.title = isRu ? 'Отменить' : 'Undo';
  undoBtn.setAttribute('aria-label', isRu ? 'Отменить' : 'Undo');
  undoBtn.innerHTML = DRAW_ICONS.undo;

  const redoBtn = document.createElement('button');
  redoBtn.className = 'ytr-thumb-overlay-icon-btn';
  redoBtn.type = 'button';
  redoBtn.title = isRu ? 'Вернуть' : 'Redo';
  redoBtn.setAttribute('aria-label', isRu ? 'Вернуть' : 'Redo');
  redoBtn.innerHTML = DRAW_ICONS.redo;

  const clearDrawingBtn = document.createElement('button');
  clearDrawingBtn.className = 'ytr-thumb-overlay-icon-btn';
  clearDrawingBtn.type = 'button';
  clearDrawingBtn.title = isRu ? 'Очистить рисунок' : 'Clear drawing';
  clearDrawingBtn.setAttribute('aria-label', isRu ? 'Очистить рисунок' : 'Clear drawing');
  clearDrawingBtn.innerHTML = DRAW_ICONS.clear;

  const brushSizeInput = document.createElement('input');
  brushSizeInput.className = 'ytr-thumb-overlay-brush-size';
  brushSizeInput.type = 'range';
  brushSizeInput.min = '1';
  brushSizeInput.max = '96';
  brushSizeInput.step = '1';
  brushSizeInput.value = '8';
  brushSizeInput.setAttribute('aria-label', isRu ? 'Размер кисти' : 'Brush size');

  const colorInput = document.createElement('input');
  colorInput.className = 'ytr-thumb-overlay-color';
  colorInput.type = 'color';
  colorInput.value = '#ffffff';
  colorInput.setAttribute('aria-label', isRu ? 'Цвет кисти' : 'Brush color');
  colorInput.tabIndex = -1;
  colorInput.hidden = true;

  const drawToggleBtn = document.createElement('button');
  drawToggleBtn.className = 'ytr-thumb-overlay-icon-btn ytr-thumb-overlay-draw-toggle';
  drawToggleBtn.type = 'button';
  drawToggleBtn.title = isRu ? 'Режим рисования' : 'Drawing mode';
  drawToggleBtn.setAttribute('aria-label', isRu ? 'Режим рисования' : 'Drawing mode');
  drawToggleBtn.innerHTML = DRAW_ICONS.drawMode;

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'ytr-thumb-overlay-icon-btn';
  zoomOutBtn.type = 'button';
  zoomOutBtn.title = isRu ? 'Отдалить' : 'Zoom out';
  zoomOutBtn.setAttribute('aria-label', isRu ? 'Отдалить' : 'Zoom out');
  zoomOutBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>`;

  const scaleBadge = document.createElement('div');
  scaleBadge.className = 'ytr-thumb-overlay-scale';

  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'ytr-thumb-overlay-icon-btn';
  zoomInBtn.type = 'button';
  zoomInBtn.title = isRu ? 'Приблизить' : 'Zoom in';
  zoomInBtn.setAttribute('aria-label', isRu ? 'Приблизить' : 'Zoom in');
  zoomInBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;

  const resetBtn = document.createElement('button');
  resetBtn.className = 'ytr-thumb-overlay-icon-btn ytr-thumb-overlay-reset';
  resetBtn.type = 'button';
  resetBtn.title = isRu ? 'Сбросить' : 'Reset';
  resetBtn.setAttribute('aria-label', isRu ? 'Сбросить масштаб' : 'Reset zoom');
  resetBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.65 6.35A7.96 7.96 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'ytr-thumb-overlay-secondary';
  copyBtn.type = 'button';
  copyBtn.setAttribute('aria-label', isRu ? 'Скопировать изображение' : 'Copy image');

  const copyIcon = document.createElement('span');
  copyIcon.className = 'ytr-thumb-overlay-btn-icon';
  const copyLabel = document.createElement('span');
  copyLabel.className = 'ytr-thumb-overlay-btn-label';
  copyBtn.appendChild(copyIcon);
  copyBtn.appendChild(copyLabel);

  const dlBtn = document.createElement('button');
  dlBtn.className = 'ytr-thumb-overlay-download';
  dlBtn.type = 'button';
  dlBtn.setAttribute('aria-label', isRu ? 'Скачать изображение' : 'Download image');
  dlBtn.innerHTML = `<span class="ytr-thumb-overlay-btn-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 18v2H7v-2h10zm0-8h-4V4H11v6H7l5 5 5-5z"/></svg></span><span class="ytr-thumb-overlay-btn-label">${isRu ? 'Скачать' : 'Download'}</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ytr-thumb-overlay-icon-btn ytr-thumb-overlay-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', isRu ? 'Закрыть предпросмотр' : 'Close preview');
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;

  const cursorPreview = document.createElement('div');
  cursorPreview.className = 'ytr-thumb-overlay-cursor-preview';
  cursorPreview.hidden = true;

  viewControls.appendChild(zoomOutBtn);
  viewControls.appendChild(scaleBadge);
  viewControls.appendChild(zoomInBtn);
  viewControls.appendChild(resetBtn);

  if (allowDrawing) {
    brushSizeShell.appendChild(brushSizeInput);
    brushSizeShell.appendChild(brushSizeValue);
    colorTrigger.appendChild(colorTriggerSwatch);
    colorTrigger.appendChild(colorTriggerIcon);
    colorPanelHeader.appendChild(colorPanelTitle);
    colorPanelHeader.appendChild(colorPanelValue);
    colorFooter.appendChild(colorHexField);
    colorPanel.appendChild(colorPanelHeader);
    colorPanel.appendChild(colorArea);
    colorPanel.appendChild(colorHueRow);
    colorPanel.appendChild(colorFooter);
    colorPanel.appendChild(colorPresetRow);
    colorWrap.appendChild(colorTrigger);
    colorWrap.appendChild(colorInput);
    colorWrap.appendChild(colorPanel);
    drawControls.appendChild(pencilBtn);
    drawControls.appendChild(eraserBtn);
    drawControls.appendChild(undoBtn);
    drawControls.appendChild(redoBtn);
    drawControls.appendChild(brushSizeShell);
    drawControls.appendChild(colorWrap);
    drawControls.appendChild(clearDrawingBtn);
  }
  actions.appendChild(drawControls);
  actions.appendChild(viewControls);
  if (allowDrawing) actions.appendChild(drawToggleBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(dlBtn);
  actions.appendChild(closeBtn);

  controls.appendChild(actions);
  mediaLayer.appendChild(img);
  mediaLayer.appendChild(drawCanvas);
  imgWrap.appendChild(mediaLayer);
  imgWrap.appendChild(cursorPreview);
  stage.appendChild(stageStatus);
  stage.appendChild(imgWrap);
  content.appendChild(stage);
  meta.appendChild(metaPill);
  meta.appendChild(metaTitle);
  if (items.length > 1) {
    gallery.appendChild(galleryTrack);
    galleryViewport.appendChild(gallery);
    galleryRow.appendChild(galleryPrev);
    galleryRow.appendChild(galleryViewport);
    galleryRow.appendChild(galleryNext);
    panel.appendChild(galleryRow);
  }
  panel.appendChild(controls);
  content.appendChild(panel);
  overlay.appendChild(backdrop);
  overlay.appendChild(content);

  const thumbnailButtons: HTMLButtonElement[] = [];

  const getCurrentItem = (): OverlayGalleryItem => items[currentIndex];

  function syncMeta() {
    const currentItem = getCurrentItem();
    if (!currentItem.kind) {
      meta.hidden = true;
      return;
    }

    meta.hidden = false;
    if (currentItem.kind === 'history') {
      metaPill.textContent = currentItem.status === 'current'
        ? (isRu ? 'Сейчас' : 'Current')
        : currentItem.status === 'published'
          ? (isRu ? 'Старт' : 'Published')
          : currentItem.status === 'first-seen'
            ? (isRu ? 'Впервые замечено' : 'First seen')
            : currentItem.status === 'archived'
              ? (isRu ? 'Архив' : 'Archive')
          : (isRu ? 'Изменение' : 'Observed');
      metaTitle.textContent = currentItem.metaLabel || (isRu ? 'История превью' : 'Thumbnail history');
      return;
    }

    metaPill.textContent = currentItem.kind === 'youtube-test'
      ? 'YT Test'
      : currentItem.kind === 'creator-test'
        ? 'A/B Test'
        : (isRu ? 'Original' : 'Original');
    metaTitle.textContent = currentItem.kind === 'youtube-test'
      ? `${isRu ? 'YouTube тест-кадр' : 'YouTube test frame'} ${currentItem.metaLabel || currentItem.label}`.trim()
      : currentItem.kind === 'creator-test'
        ? `${isRu ? 'Авторское A/B превью' : 'Creator A/B thumbnail'} ${currentItem.metaLabel || currentItem.label}`.trim()
        : (currentItem.metaLabel || (isRu ? 'Оригинальное превью' : 'Original thumbnail'));
  }

  function setCopyButtonState(state: 'idle' | 'busy' | 'success') {
    copyBtn.dataset.state = state;
    if (state === 'success') {
      copyIcon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      copyLabel.textContent = isRu ? 'Скопировано' : 'Copied';
      return;
    }

    copyIcon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1Zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm0 16H8V7h11v14Z"/></svg>`;
    copyLabel.textContent = isRu ? 'Копировать' : 'Copy';
  }

  setCopyButtonState('idle');

  // --- Zoom & Pan state ---
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startPanX = 0;
  let startPanY = 0;
  let lastTouchDist = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let drawMode = false;
  let drawTool: OverlayDrawTool = 'none';
  let drawing = false;
  let activeStroke: OverlayStroke | null = null;
  let drawingStrokes: OverlayStroke[] = [];
  let drawingRedoStrokes: OverlayStroke[] = [];
  const drawingCtx = drawCanvas.getContext('2d');
  const drawingStates = new Map<number, { strokes: OverlayStroke[]; redo: OverlayStroke[] }>();
  let pointerPreviewActive = false;
  let pointerPreviewPinned = false;
  let pointerPreviewX = 0;
  let pointerPreviewY = 0;
  let pointerPreviewTimeout: number | null = null;
  let lastStrokeAnchorPoint: { x: number; y: number } | null = null;
  let colorPanelOpen = false;
  let colorHsv = rgbToHsv(hexToRgb(colorInput.value) || { r: 255, g: 255, b: 255 });
  let eyedropperMode = false;
  let spacePanActive = false;
  const colorPresets = ['#000000', '#ffffff', '#ff0000', '#ff7a00', '#ffd400', '#00c950', '#0096ff', '#2046f5', '#7a2cff', '#ff2ea6'];

  function cloneStroke(stroke: OverlayStroke): OverlayStroke {
    return {
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    };
  }

  function loadDrawingState(index: number) {
    const state = drawingStates.get(index);
    drawingStrokes = state ? state.strokes.map(cloneStroke) : [];
    drawingRedoStrokes = state ? state.redo.map(cloneStroke) : [];
    updateLastStrokeAnchorPoint();
  }

  function persistDrawingState() {
    if (!allowDrawing) return;
    drawingStates.set(currentIndex, {
      strokes: drawingStrokes.map(cloneStroke),
      redo: drawingRedoStrokes.map(cloneStroke),
    });
  }

  function getBrushBaseSize(): number {
    const width = drawCanvas.clientWidth || img.clientWidth || 1;
    const height = drawCanvas.clientHeight || img.clientHeight || 1;
    return Math.max(1, Math.min(width, height));
  }

  function updateLastStrokeAnchorPoint() {
    const lastStroke = drawingStrokes[drawingStrokes.length - 1];
    const lastPoint = lastStroke?.points[lastStroke.points.length - 1];
    lastStrokeAnchorPoint = lastPoint ? { ...lastPoint } : null;
  }

  function syncColorPickerUi() {
    const normalizedColor = normalizeHexColor(colorInput.value, '#ffffff');
    const hueColor = rgbToHex(hsvToRgb({ h: colorHsv.h, s: 1, v: 1 }));
    colorTriggerSwatch.style.background = normalizedColor;
    colorPanelValue.textContent = normalizedColor.toUpperCase();
    colorHexField.value = normalizedColor.toUpperCase();
    colorArea.style.setProperty('--ytr-picker-hue', hueColor);
    colorAreaThumb.style.left = `${colorHsv.s * 100}%`;
    colorAreaThumb.style.top = `${(1 - colorHsv.v) * 100}%`;
    colorHueInput.value = String(Math.round(colorHsv.h));
    colorTrigger.setAttribute('aria-expanded', String(colorPanelOpen));
    colorWrap.dataset.open = String(colorPanelOpen);
    colorEyedropperBtn.classList.toggle('active', eyedropperMode);
    colorEyedropperBtn.setAttribute('aria-pressed', String(eyedropperMode));
  }

  function setColorPanelOpen(next: boolean) {
    colorPanelOpen = next;
    colorPanel.hidden = !next;
    syncColorPickerUi();
  }

  function setBrushColorFromHsv(nextColor: HsvColor) {
    colorHsv = {
      h: ((nextColor.h % 360) + 360) % 360,
      s: clamp(nextColor.s, 0, 1),
      v: clamp(nextColor.v, 0, 1),
    };
    colorInput.value = rgbToHex(hsvToRgb(colorHsv));
    syncColorPickerUi();
    updateCursorPreview();
  }

  function setBrushColor(nextColor: string) {
    const normalized = normalizeHexColor(nextColor, colorInput.value);
    const rgb = hexToRgb(normalized);
    if (!rgb) return;
    colorInput.value = normalized;
    colorHsv = rgbToHsv(rgb);
    syncColorPickerUi();
    updateCursorPreview();
  }

  function updateColorAreaFromPointer(clientX: number, clientY: number) {
    const rect = colorArea.getBoundingClientRect();
    const saturation = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const value = 1 - clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    setBrushColorFromHsv({ h: colorHsv.h, s: saturation, v: value });
  }

  function setEyedropperMode(next: boolean) {
    if (!allowDrawing) return;
    eyedropperMode = next;
    if (next && !drawMode) {
      setDrawMode(true);
    }
    if (next) {
      setColorPanelOpen(false);
    } else {
      syncColorPickerUi();
    }
    syncToolState();
  }

  function bumpBrushSize(delta: number) {
    const min = Number(brushSizeInput.min);
    const max = Number(brushSizeInput.max);
    const nextValue = clamp(Number(brushSizeInput.value) + delta, min, max);
    if (nextValue === Number(brushSizeInput.value)) return;
    brushSizeInput.value = String(nextValue);
    updateBrushSizeValue();
    showCenteredBrushPreview();
    updateCursorPreview();
  }

  function syncToolState() {
    if (allowDrawing) {
      pencilBtn.classList.toggle('active', drawMode && drawTool === 'pencil');
      eraserBtn.classList.toggle('active', drawMode && drawTool === 'eraser');
      undoBtn.disabled = drawingStrokes.length === 0;
      redoBtn.disabled = drawingRedoStrokes.length === 0;
      clearDrawingBtn.disabled = drawingStrokes.length === 0;
      drawToggleBtn.classList.toggle('active', drawMode);
      drawToggleBtn.title = drawMode ? (isRu ? 'Закрыть режим рисования' : 'Exit drawing mode') : (isRu ? 'Режим рисования' : 'Drawing mode');
      drawToggleBtn.setAttribute('aria-label', drawToggleBtn.title);
      drawControls.hidden = !drawMode;
      viewControls.hidden = drawMode;
      copyBtn.hidden = drawMode;
      dlBtn.hidden = drawMode;
      colorWrap.hidden = !drawMode || drawTool === 'eraser' || drawTool === 'none';
      brushSizeShell.hidden = !drawMode || drawTool === 'none';
    }

    if (eyedropperMode) {
      cursorPreview.hidden = true;
      imgWrap.style.cursor = 'crosshair';
      return;
    }

    if (spacePanActive) {
      cursorPreview.hidden = true;
      imgWrap.style.cursor = isDragging ? 'grabbing' : 'grab';
      return;
    }

    if (drawMode && drawTool === 'pencil') {
      imgWrap.style.cursor = 'none';
      updateCursorPreview();
      return;
    }
    if (drawMode && drawTool === 'eraser') {
      imgWrap.style.cursor = 'none';
      updateCursorPreview();
      return;
    }
    cursorPreview.hidden = true;
    if (!allowDrawing) return;
    imgWrap.style.cursor = isDragging ? 'grabbing' : 'grab';
  }

  function updateBrushSizeValue() {
    brushSizeValue.textContent = `${brushSizeInput.value}px`;
  }

  function updateCursorPreview() {
    if (!allowDrawing || !drawMode || drawTool === 'none' || (!pointerPreviewActive && !pointerPreviewPinned)) {
      cursorPreview.hidden = true;
      return;
    }

    const diameter = Math.max(6, Math.round(Number(brushSizeInput.value) * Math.max(scale, 0.5)));
    cursorPreview.hidden = false;
    cursorPreview.dataset.tool = drawTool;
    cursorPreview.style.width = `${diameter}px`;
    cursorPreview.style.height = `${diameter}px`;
    cursorPreview.style.left = `${Math.round(pointerPreviewX)}px`;
    cursorPreview.style.top = `${Math.round(pointerPreviewY)}px`;
    if (drawTool === 'eraser') {
      cursorPreview.style.background = 'rgba(255, 255, 255, 0.08)';
      cursorPreview.style.borderColor = 'rgba(255, 255, 255, 0.6)';
    } else {
      cursorPreview.style.background = `${colorInput.value}2b`;
      cursorPreview.style.borderColor = colorInput.value;
    }
  }

  function showCenteredBrushPreview() {
    if (!allowDrawing || !drawMode || drawTool === 'none') return;
    const wrapRect = imgWrap.getBoundingClientRect();
    const previewRect = drawCanvas.clientWidth > 0 && drawCanvas.clientHeight > 0
      ? drawCanvas.getBoundingClientRect()
      : imgWrap.getBoundingClientRect();
    pointerPreviewX = (previewRect.left - wrapRect.left) + previewRect.width / 2;
    pointerPreviewY = (previewRect.top - wrapRect.top) + previewRect.height / 2;
    pointerPreviewPinned = true;
    updateCursorPreview();
    if (pointerPreviewTimeout) {
      window.clearTimeout(pointerPreviewTimeout);
    }
    pointerPreviewTimeout = window.setTimeout(() => {
      pointerPreviewPinned = false;
      pointerPreviewTimeout = null;
      updateCursorPreview();
    }, 850);
  }

  function redrawDrawing() {
    if (!allowDrawing || !drawingCtx) return;
    const width = Math.max(1, drawCanvas.clientWidth);
    const height = Math.max(1, drawCanvas.clientHeight);
    drawingCtx.clearRect(0, 0, width, height);
    renderOverlayStrokes(drawingCtx, drawingStrokes, width, height);
    clearDrawingBtn.disabled = drawingStrokes.length === 0;
  }

  function syncDrawingSurface() {
    if (!allowDrawing || !drawingCtx) return;
    const width = Math.max(1, Math.round(img.clientWidth));
    const height = Math.max(1, Math.round(img.clientHeight));
    const dpr = window.devicePixelRatio || 1;
    drawCanvas.style.width = `${width}px`;
    drawCanvas.style.height = `${height}px`;
    drawCanvas.width = Math.max(1, Math.round(width * dpr));
    drawCanvas.height = Math.max(1, Math.round(height * dpr));
    drawingCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawDrawing();
    updateCursorPreview();
  }

  function clearDrawing() {
    drawingStrokes = [];
    drawingRedoStrokes = [];
    activeStroke = null;
    updateLastStrokeAnchorPoint();
    persistDrawingState();
    redrawDrawing();
  }

  function getPointFromEvent(clientX: number, clientY: number) {
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    };
  }

  async function sampleColorFromPreview(clientX: number, clientY: number): Promise<string | null> {
    const point = getPointFromEvent(clientX, clientY);
    const source = await getExportSource();
    const sourceImage = await loadImage(source);
    const width = Math.max(1, sourceImage.naturalWidth || sourceImage.width);
    const height = Math.max(1, sourceImage.naturalHeight || sourceImage.height);
    if (!width || !height) return null;

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = width;
    sampleCanvas.height = height;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleCtx) return null;

    try {
      sampleCtx.drawImage(sourceImage, 0, 0, width, height);
      const px = clamp(Math.round(point.x * (width - 1)), 0, width - 1);
      const py = clamp(Math.round(point.y * (height - 1)), 0, height - 1);
      const [r, g, b, alpha] = sampleCtx.getImageData(px, py, 1, 1).data;
      if (!alpha) return null;
      return rgbToHex({ r, g, b });
    } catch (error) {
      console.warn('[YouTube Rewind] Preview eyedropper failed', error);
      return null;
    }
  }

  async function pickBrushColorFromPreview(clientX: number, clientY: number) {
    try {
      const sampledColor = await sampleColorFromPreview(clientX, clientY);
      if (!sampledColor) {
        showYtrToast(isRu ? 'Не удалось считать цвет с превью' : 'Could not sample color from preview');
        setEyedropperMode(false);
        return;
      }

      setBrushColor(sampledColor);
      if (drawTool === 'none') {
        drawTool = 'pencil';
      }
      showCenteredBrushPreview();
      setEyedropperMode(false);
      syncToolState();
    } catch (error) {
      console.warn('[YouTube Rewind] Eyedropper load failed', error);
      showYtrToast(isRu ? 'Не удалось считать цвет с превью' : 'Could not sample color from preview');
      setEyedropperMode(false);
    }
  }

  function beginDrawing(clientX: number, clientY: number, constrainLine = false) {
    if (!allowDrawing || !drawingCtx || !drawMode || drawTool === 'none') return;
    const point = getPointFromEvent(clientX, clientY);
    const anchorPoint = constrainLine && lastStrokeAnchorPoint ? { ...lastStrokeAnchorPoint } : null;
    activeStroke = {
      tool: drawTool,
      color: colorInput.value,
      sizeRatio: Number(brushSizeInput.value) / getBrushBaseSize(),
      points: anchorPoint ? [anchorPoint, point] : [point],
    };
    drawingRedoStrokes = [];
    drawingStrokes = [...drawingStrokes, activeStroke];
    redrawDrawing();
  }

  function pushDrawingPoint(clientX: number, clientY: number, constrainLine = false) {
    if (!activeStroke) return;
    const point = getPointFromEvent(clientX, clientY);
    if (constrainLine && activeStroke.points.length) {
      activeStroke.points = [activeStroke.points[0], point];
    } else {
      const lastPoint = activeStroke.points[activeStroke.points.length - 1];
      if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 0.001) return;
      activeStroke.points.push(point);
    }
    redrawDrawing();
  }

  function applyTransform(animate = false) {
    const baseWidth = mediaLayer.clientWidth || img.clientWidth || imgWrap.clientWidth;
    const baseHeight = mediaLayer.clientHeight || img.clientHeight || imgWrap.clientHeight;
    const maxPanX = Math.max(baseWidth * scale, imgWrap.clientWidth) * 1.25;
    const maxPanY = Math.max(baseHeight * scale, imgWrap.clientHeight) * 1.25;
    panX = clamp(panX, -maxPanX, maxPanX);
    panY = clamp(panY, -maxPanY, maxPanY);

    mediaLayer.style.transition = animate ? 'transform 0.24s cubic-bezier(0.2, 0, 0, 1)' : 'none';
    mediaLayer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    scaleBadge.textContent = `${Math.round(scale * 100)}%`;
    content.dataset.zoomed = String(scale !== 1 || panX !== 0 || panY !== 0);
    updateCursorPreview();
    syncToolState();
  }

  function resetTransform() {
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform(true);
  }

  function zoomBy(factor: number, animate = true) {
    scale = clamp(scale * factor, 0.5, 8);
    applyTransform(animate);
  }

  function getGalleryMaxScrollLeft(): number {
    return Math.max(0, galleryViewport.scrollWidth - galleryViewport.clientWidth);
  }

  function scrollGalleryTo(left: number, behavior: ScrollBehavior = 'smooth') {
    galleryViewport.scrollTo({
      left: clamp(left, 0, getGalleryMaxScrollLeft()),
      behavior,
    });
  }

  function syncGalleryState() {
    thumbnailButtons.forEach((button, index) => {
      button.classList.toggle('active', index === currentIndex);
    });
    galleryPrev.disabled = currentIndex === 0;
    galleryNext.disabled = currentIndex === items.length - 1;
    const activeThumb = thumbnailButtons[currentIndex];
    if (items.length > 1 && activeThumb && galleryViewport.isConnected) {
      const viewportRect = galleryViewport.getBoundingClientRect();
      if (!viewportRect.width) return;
      const thumbRect = activeThumb.getBoundingClientRect();
      const targetLeft = galleryViewport.scrollLeft + (thumbRect.left - viewportRect.left) - (viewportRect.width - thumbRect.width) / 2;
      scrollGalleryTo(targetLeft);
    }
  }

  function setCurrentIndex(index: number, reset = true) {
    persistDrawingState();
    currentIndex = clamp(index, 0, items.length - 1);
    const nextSrc = getCurrentItem().src;
    const reusedLoadedImage = img.currentSrc === nextSrc && img.complete;
    loadDrawingState(currentIndex);
    if (reusedLoadedImage) {
      stageStatus.hidden = true;
    } else {
      stageStatus.textContent = isRu ? 'Загрузка превью…' : 'Loading preview…';
      stageStatus.hidden = false;
      img.src = nextSrc;
    }
    if (reset) {
      scale = 1;
      panX = 0;
      panY = 0;
    }
    setCopyButtonState('idle');
    updateBrushSizeValue();
    syncMeta();
    syncGalleryState();
    if (reusedLoadedImage) {
      syncDrawingSurface();
      applyTransform(false);
    }
  }

  items.forEach((item, index) => {
    const thumbButton = document.createElement('button');
    thumbButton.className = 'ytr-thumb-overlay-thumb';
    thumbButton.type = 'button';
    thumbButton.setAttribute('aria-label', item.label);

    const thumbImage = document.createElement('img');
    thumbImage.src = item.src;
    thumbImage.alt = '';
    thumbImage.draggable = false;

    const thumbBadge = document.createElement('span');
    thumbBadge.className = 'ytr-thumb-overlay-thumb-badge';
    thumbBadge.textContent = item.label;

    thumbButton.appendChild(thumbImage);
    thumbButton.appendChild(thumbBadge);
    thumbButton.addEventListener('click', (event) => {
      event.stopPropagation();
      setCurrentIndex(index);
    });
    thumbButton.title = item.label;
    thumbnailButtons.push(thumbButton);
    galleryTrack.appendChild(thumbButton);
  });

  galleryViewport.addEventListener('wheel', (event) => {
    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!dominantDelta) return;

    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 18
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? Math.max(1, galleryViewport.clientWidth)
        : 1;
    const nextLeft = clamp(
      galleryViewport.scrollLeft + (dominantDelta * unit),
      0,
      getGalleryMaxScrollLeft(),
    );

    if (Math.abs(nextLeft - galleryViewport.scrollLeft) < 0.5) return;

    event.preventDefault();
    scrollGalleryTo(nextLeft, 'auto');
  }, { passive: false });

  galleryViewport.addEventListener('scroll', () => {
    const maxScrollLeft = getGalleryMaxScrollLeft();
    const clampedLeft = clamp(galleryViewport.scrollLeft, 0, maxScrollLeft);
    if (Math.abs(clampedLeft - galleryViewport.scrollLeft) > 0.5) {
      galleryViewport.scrollLeft = clampedLeft;
    }
  }, { passive: true });

  img.addEventListener('load', () => {
    stageStatus.hidden = true;
    syncDrawingSurface();
    applyTransform(false);
  });
  img.addEventListener('error', () => {
    stageStatus.hidden = false;
    stageStatus.textContent = isRu ? 'Не удалось загрузить превью' : 'Could not load preview';
  });

  imgWrap.addEventListener('mouseenter', () => {
    pointerPreviewActive = true;
    updateCursorPreview();
  });

  imgWrap.addEventListener('mouseleave', () => {
    pointerPreviewActive = false;
    updateCursorPreview();
  });

  imgWrap.addEventListener('mousemove', (event) => {
    const rect = imgWrap.getBoundingClientRect();
    pointerPreviewX = event.clientX - rect.left;
    pointerPreviewY = event.clientY - rect.top;
    updateCursorPreview();
  });

  imgWrap.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.14 : 0.14;
    const nextScale = clamp(scale * (1 + delta), 0.5, 8);
    const rect = imgWrap.getBoundingClientRect();
    const cx = event.clientX - rect.left - rect.width / 2;
    const cy = event.clientY - rect.top - rect.height / 2;
    const ratio = nextScale / scale;
    panX = cx - ratio * (cx - panX);
    panY = cy - ratio * (cy - panY);
    scale = nextScale;
    applyTransform(false);
  }, { passive: false });

  imgWrap.addEventListener('dblclick', (event) => {
    event.preventDefault();
    resetTransform();
  });

  imgWrap.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (allowDrawing && drawMode && (eyedropperMode || event.altKey)) {
      event.preventDefault();
      event.stopPropagation();
      void pickBrushColorFromPreview(event.clientX, event.clientY);
      return;
    }

    if (allowDrawing && drawMode && drawTool !== 'none' && !spacePanActive) {
      drawing = true;
      beginDrawing(event.clientX, event.clientY, event.shiftKey);

      const onDrawMove = (moveEvent: MouseEvent) => {
        if (!drawing) return;
        const rect = imgWrap.getBoundingClientRect();
        pointerPreviewX = moveEvent.clientX - rect.left;
        pointerPreviewY = moveEvent.clientY - rect.top;
        pushDrawingPoint(moveEvent.clientX, moveEvent.clientY, moveEvent.shiftKey);
        updateCursorPreview();
      };

      const onDrawUp = () => {
        drawing = false;
        if (activeStroke?.points.length) {
          lastStrokeAnchorPoint = { ...activeStroke.points[activeStroke.points.length - 1] };
        }
        activeStroke = null;
        persistDrawingState();
        syncToolState();
        document.removeEventListener('mousemove', onDrawMove);
        document.removeEventListener('mouseup', onDrawUp);
      };

      document.addEventListener('mousemove', onDrawMove);
      document.addEventListener('mouseup', onDrawUp);
      return;
    }

    event.preventDefault();
    isDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    startPanX = panX;
    startPanY = panY;
    syncToolState();

    const onMove = (moveEvent: MouseEvent) => {
      panX = startPanX + (moveEvent.clientX - dragStartX);
      panY = startPanY + (moveEvent.clientY - dragStartY);
      applyTransform(false);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      isDragging = false;
      syncToolState();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  imgWrap.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      lastTouchDist = Math.hypot(dx, dy);
      return;
    }

    if (event.touches.length === 1) {
      lastTouchX = event.touches[0].clientX;
      lastTouchY = event.touches[0].clientY;
      startPanX = panX;
      startPanY = panY;
    }
  }, { passive: true });

  imgWrap.addEventListener('touchmove', (event) => {
    event.preventDefault();

    if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const distance = Math.hypot(dx, dy);
      if (lastTouchDist > 0) {
        scale = clamp(scale * (distance / lastTouchDist), 0.5, 8);
        applyTransform(false);
      }
      lastTouchDist = distance;
      return;
    }

    if (event.touches.length === 1) {
      panX = startPanX + (event.touches[0].clientX - lastTouchX);
      panY = startPanY + (event.touches[0].clientY - lastTouchY);
      applyTransform(false);
    }
  }, { passive: false });

  async function getExportSource(): Promise<string> {
    if (!allowDrawing || !drawingStrokes.length) {
      return getCurrentItem().src;
    }
    return await buildOverlayExportDataUrl(getCurrentItem(), drawingStrokes);
  }

  function hasOverlayChanges(): boolean {
    if (scale !== 1 || panX !== 0 || panY !== 0) return true;
    if (!allowDrawing) return false;
    if (drawingStrokes.length > 0 || drawingRedoStrokes.length > 0) return true;
    for (const state of drawingStates.values()) {
      if (state.strokes.length > 0 || state.redo.length > 0) return true;
    }
    return false;
  }

  const tryCopyImage = async () => {
    copyBtn.disabled = true;
    setCopyButtonState('busy');
    try {
      const source = await getExportSource();
      const result = await copyImageToClipboard(source);
      copyBtn.disabled = false;

      if (result === 'image') {
        setCopyButtonState('success');
        showYtrToast(isRu ? 'Изображение скопировано' : 'Image copied to clipboard');
        setTimeout(() => setCopyButtonState('idle'), 1400);
        return;
      }

      setCopyButtonState('idle');
      if (result === 'link') {
        showYtrToast(isRu ? 'Ссылка на изображение скопирована' : 'Image link copied');
        return;
      }

      showYtrToast(isRu ? 'Не удалось скопировать изображение' : 'Could not copy image');
    } catch (error) {
      console.error('[YouTube Rewind] Copy overlay image failed', error);
      copyBtn.disabled = false;
      setCopyButtonState('idle');
      showYtrToast(isRu ? 'Не удалось скопировать изображение' : 'Could not copy image');
    }
  };

  const remove = () => {
    persistDrawingState();
    if (pointerPreviewTimeout) {
      window.clearTimeout(pointerPreviewTimeout);
      pointerPreviewTimeout = null;
    }
    overlay.remove();
    document.documentElement.classList.remove('ytr-overlay-lock-scroll');
    document.removeEventListener('keydown', handler);
    document.removeEventListener('keyup', handleOverlayKeyUp);
    document.removeEventListener('pointerdown', handleOverlayPointerDown, true);
    window.removeEventListener('resize', syncDrawingSurface);
    activeOverlayCleanup = null;
  };

  activeOverlayCleanup = remove;

  const requestRemove = async () => {
    if (hasOverlayChanges()) {
      const confirmed = await showYtrConfirmDialog({
        title: isRu ? 'Закрыть без сохранения?' : 'Discard changes?',
        message: isRu
          ? 'Масштаб, позиция и рисунок будут потеряны.'
          : 'Your zoom, position, and drawing changes will be lost.',
        confirmText: isRu ? 'Закрыть' : 'Discard',
        cancelText: isRu ? 'Продолжить' : 'Keep editing',
      });
      if (!confirmed) return;
    }
    remove();
  };

  function undoDrawing() {
    if (!drawingStrokes.length) return;
    const lastStroke = drawingStrokes[drawingStrokes.length - 1];
    drawingRedoStrokes = [...drawingRedoStrokes, cloneStroke(lastStroke)];
    drawingStrokes = drawingStrokes.slice(0, -1);
    updateLastStrokeAnchorPoint();
    persistDrawingState();
    redrawDrawing();
    syncToolState();
  }

  function redoDrawing() {
    if (!drawingRedoStrokes.length) return;
    const restored = drawingRedoStrokes[drawingRedoStrokes.length - 1];
    drawingRedoStrokes = drawingRedoStrokes.slice(0, -1);
    drawingStrokes = [...drawingStrokes, cloneStroke(restored)];
    updateLastStrokeAnchorPoint();
    persistDrawingState();
    redrawDrawing();
    syncToolState();
  }

  function setDrawMode(nextDrawMode: boolean) {
    if (!allowDrawing) return;
    drawMode = nextDrawMode;
    if (drawMode && drawTool === 'none') {
      drawTool = 'pencil';
    }
    if (!drawMode) {
      drawTool = 'none';
      eyedropperMode = false;
      spacePanActive = false;
      setColorPanelOpen(false);
    }
    syncToolState();
  }

  function handler(event: KeyboardEvent) {
    const metaOrCtrl = event.ctrlKey || event.metaKey;
    const target = event.target;
    const isTextInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (event.key === 'Escape' && (colorPanelOpen || eyedropperMode)) {
      event.preventDefault();
      setEyedropperMode(false);
      setColorPanelOpen(false);
      return;
    }
    if (allowDrawing && drawMode && event.code === 'Space' && !isTextInput) {
      event.preventDefault();
      spacePanActive = true;
      syncToolState();
      return;
    }
    if (isTextInput && !metaOrCtrl) return;
    if (allowDrawing && drawMode && metaOrCtrl && event.code === 'KeyZ') {
      event.preventDefault();
      if (event.shiftKey) redoDrawing();
      else undoDrawing();
      return;
    }
    if (allowDrawing && drawMode && metaOrCtrl && event.code === 'KeyY') {
      event.preventDefault();
      redoDrawing();
      return;
    }
    if (allowDrawing && (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
      event.preventDefault();
      bumpBrushSize(event.code === 'BracketRight' ? 4 : -4);
      return;
    }
    if (allowDrawing && event.code === 'KeyB') {
      event.preventDefault();
      setEyedropperMode(false);
      setDrawMode(true);
      drawTool = 'pencil';
      syncToolState();
      return;
    }
    if (allowDrawing && event.code === 'KeyE') {
      event.preventDefault();
      setEyedropperMode(false);
      setDrawMode(true);
      drawTool = 'eraser';
      syncToolState();
      return;
    }
    if (allowDrawing && event.code === 'KeyI') {
      event.preventDefault();
      setEyedropperMode(!eyedropperMode);
      return;
    }
    if (allowDrawing && drawMode && (event.code === 'Delete' || event.code === 'Backspace')) {
      event.preventDefault();
      clearDrawing();
      syncToolState();
      return;
    }
    if (event.key === 'Escape') void requestRemove();
    if (event.code === 'Digit0' || event.code === 'Numpad0' || event.code === 'KeyR') resetTransform();
    if (event.code === 'Equal' || event.code === 'NumpadAdd') zoomBy(1.3);
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') zoomBy(1 / 1.3);
    if (event.code === 'KeyC') void tryCopyImage();
    if (event.key === 'ArrowLeft' && items.length > 1) setCurrentIndex(currentIndex - 1);
    if (event.key === 'ArrowRight' && items.length > 1) setCurrentIndex(currentIndex + 1);
  }

  function handleOverlayKeyUp(event: KeyboardEvent) {
    if (event.code !== 'Space' || !spacePanActive) return;
    spacePanActive = false;
    syncToolState();
  }

  function handleOverlayPointerDown(event: PointerEvent) {
    if (!allowDrawing || !colorPanelOpen) return;
    const target = event.target;
    if (target instanceof Node && colorWrap.contains(target)) return;
    setColorPanelOpen(false);
  }

  backdrop.addEventListener('click', () => { void requestRemove(); });
  closeBtn.addEventListener('click', () => { void requestRemove(); });
  zoomOutBtn.addEventListener('click', (event) => { event.stopPropagation(); zoomBy(1 / 1.25); });
  zoomInBtn.addEventListener('click', (event) => { event.stopPropagation(); zoomBy(1.25); });
  resetBtn.addEventListener('click', (event) => { event.stopPropagation(); resetTransform(); });
  copyBtn.addEventListener('click', (event) => { event.stopPropagation(); void tryCopyImage(); });
  dlBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    try {
      await triggerDownload(await getExportSource(), getCurrentItem().filename);
    } catch (error) {
      console.error('[YouTube Rewind] Download overlay image failed', error);
      showYtrToast(isRu ? 'Не удалось скачать изображение' : 'Could not download image');
    }
  });
  galleryPrev.addEventListener('click', (event) => {
    event.stopPropagation();
    setCurrentIndex(currentIndex - 1);
  });
  galleryNext.addEventListener('click', (event) => {
    event.stopPropagation();
    setCurrentIndex(currentIndex + 1);
  });
  if (allowDrawing) {
    const toggleDrawTool = (tool: OverlayDrawTool) => {
      setEyedropperMode(false);
      if (!drawMode) drawMode = true;
      drawTool = drawTool === tool ? 'none' : tool;
      if (drawTool === 'none') drawTool = tool;
      if (drawTool !== 'pencil') {
        setColorPanelOpen(false);
      }
      syncToolState();
    };

    colorPresets.forEach((preset) => {
      const presetButton = document.createElement('button');
      presetButton.className = 'ytr-thumb-overlay-color-preset';
      presetButton.type = 'button';
      presetButton.style.background = preset;
      presetButton.title = preset.toUpperCase();
      presetButton.setAttribute('aria-label', `${isRu ? 'Цвет' : 'Color'} ${preset.toUpperCase()}`);
      presetButton.addEventListener('click', (event) => {
        event.stopPropagation();
        setBrushColor(preset);
      });
      colorPresetRow.appendChild(presetButton);
    });

    drawToggleBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      setDrawMode(!drawMode);
    });
    pencilBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleDrawTool('pencil');
    });
    eraserBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleDrawTool('eraser');
    });
    clearDrawingBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      clearDrawing();
      syncToolState();
    });
    undoBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      undoDrawing();
    });
    redoBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      redoDrawing();
    });
    colorTrigger.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!drawMode) {
        setDrawMode(true);
        drawTool = 'pencil';
      }
      setEyedropperMode(false);
      setColorPanelOpen(!colorPanelOpen);
    });
    colorArea.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setEyedropperMode(false);
      setColorPanelOpen(true);
      updateColorAreaFromPointer(event.clientX, event.clientY);

      const onMove = (moveEvent: PointerEvent) => {
        updateColorAreaFromPointer(moveEvent.clientX, moveEvent.clientY);
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    colorHueInput.addEventListener('input', () => {
      setBrushColorFromHsv({ h: Number(colorHueInput.value), s: colorHsv.s, v: colorHsv.v });
    });
    colorHexField.addEventListener('input', () => {
      const normalized = normalizeHexColor(colorHexField.value, '');
      if (normalized) {
        setBrushColor(normalized);
      } else {
        colorPanelValue.textContent = colorHexField.value.toUpperCase();
      }
    });
    colorHexField.addEventListener('blur', () => {
      colorHexField.value = colorInput.value.toUpperCase();
      colorPanelValue.textContent = colorInput.value.toUpperCase();
    });
    colorHexField.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      setBrushColor(normalizeHexColor(colorHexField.value, colorInput.value));
      setColorPanelOpen(false);
    });
    colorEyedropperBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      setEyedropperMode(!eyedropperMode);
    });
    colorInput.addEventListener('input', () => {
      if (drawTool === 'none') {
        drawTool = 'pencil';
      }
      setBrushColor(colorInput.value);
      syncToolState();
    });
    brushSizeInput.addEventListener('input', () => {
      updateBrushSizeValue();
      showCenteredBrushPreview();
      updateCursorPreview();
    });
  }
  document.body.appendChild(overlay);
  document.addEventListener('keydown', handler);
  document.addEventListener('keyup', handleOverlayKeyUp);
  document.addEventListener('pointerdown', handleOverlayPointerDown, true);
  document.documentElement.classList.add('ytr-overlay-lock-scroll');
  window.addEventListener('resize', syncDrawingSurface);
  requestAnimationFrame(() => {
    loadDrawingState(currentIndex);
    updateBrushSizeValue();
    syncColorPickerUi();
    setCurrentIndex(currentIndex, true);
    overlay.focus();
    applyTransform(false);
    syncToolState();
  });
}

function createScreenshotAction(videoId: string, isRu: boolean, nativeActionAnchor: Element | null): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'ytr-utility-btn-wrap ytr-screenshot-btn-wrap';
  wrapper.dataset.videoId = videoId;
  applyNativeActionWrapperClasses(wrapper, nativeActionAnchor, ['ytr-utility-btn-wrap', 'ytr-screenshot-btn-wrap']);

  const button = document.createElement('button');
  button.type = 'button';
  button.title = isRu ? 'Сделать скриншот кадра' : 'Capture frame screenshot';
  button.setAttribute('aria-label', isRu ? 'Сделать скриншот кадра' : 'Capture frame screenshot');
  applyNativeActionButtonClasses(button, nativeActionAnchor, ['ytr-action-btn', 'ytr-action-btn-screenshot']);
  button.innerHTML = GOOGLE_ICON_SVGS.photoCamera;

  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (button.disabled) return;

    button.disabled = true;
    wrapper.dataset.busy = 'true';

    try {
      const shot = await captureCurrentVideoFrame(videoId);
      if (currentSettings?.betaVideoFrameScreenshot && currentSettings.betaScreenshotInstantDownload) {
        await triggerDownload(shot.dataUrl, shot.filename);
        showYtrToast(isRu ? 'Скриншот сохранён' : 'Screenshot downloaded');
      } else {
        showImageOverlay(shot.dataUrl, shot.filename, [{ src: shot.dataUrl, filename: shot.filename, label: '1' }], 0, { drawing: true });
      }
    } catch (error) {
      console.error('[YouTube Rewind] Frame screenshot failed', error);
      showYtrToast(isRu ? 'Не удалось сделать скриншот кадра' : 'Could not capture frame screenshot');
    } finally {
      button.disabled = false;
      delete wrapper.dataset.busy;
    }
  });

  wrapper.appendChild(button);
  return wrapper;
}

// --- v0.5.0: Download Button (Thumbnail + Video) ---

let downloadBtnInjected = false;
let downloadNavListenerAdded = false;
let downloadMenuCloseHandler: (() => void) | null = null;
let downloadMenuViewportListenerAdded = false;
let downloadInjectTimers: number[] = [];
type PortaledYtrMenu = HTMLElement & {
  __ytrOwner?: HTMLElement | null;
  __ytrRepositionFrame?: number | null;
  __ytrResizeObserver?: ResizeObserver | null;
};

function scheduleDownloadButtonInjection(callback: () => void, delays: number[]): void {
  downloadInjectTimers.forEach((timer) => clearTimeout(timer));
  downloadInjectTimers = delays.map((delay) => window.setTimeout(callback, delay));
}

function setDownloadMenuScrollLock(locked: boolean): void {
  document.documentElement.classList.toggle('ytr-download-menu-lock-scroll', locked);
}

function closeAllYtrMenus(): void {
  const openMenus = document.querySelectorAll('.ytr-download-menu-open') as NodeListOf<HTMLElement>;
  openMenus.forEach((menu) => {
    menu.classList.remove('ytr-download-menu-open');
    menu.style.removeProperty('left');
    menu.style.removeProperty('top');
    menu.style.removeProperty('bottom');
    delete menu.dataset.position;

    const owner = (menu as HTMLElement & { __ytrOwner?: HTMLElement | null }).__ytrOwner;
    if (owner && menu.parentElement !== owner) {
      owner.appendChild(menu);
    }
  });
  setDownloadMenuScrollLock(false);
}

function closeNativeYouTubeMenus(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  (document.activeElement as HTMLElement | null)?.blur?.();

  const outsideTarget = document.body || document.documentElement;
  ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) => {
    outsideTarget.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
  });

  document.querySelectorAll<HTMLElement>('[aria-expanded="true"]').forEach((trigger) => {
    if (trigger.closest('.ytr-download-btn, .ytr-screenshot-btn-wrap')) return;
    trigger.setAttribute('aria-expanded', 'false');
  });
}

function positionYtrMenu(menu: HTMLElement, wrapper: HTMLElement): void {
  const viewportPadding = 12;
  const menuGap = 12;
  menu.style.bottom = 'auto';
  menu.style.maxHeight = `calc(100vh - ${viewportPadding * 2}px)`;
  const menuRect = menu.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();

  let left = wrapperRect.right - menuRect.width;
  left = clamp(left, viewportPadding, window.innerWidth - menuRect.width - viewportPadding);

  let top = wrapperRect.bottom + menuGap;
  let verticalPosition: 'below' | 'above' = 'below';
  if (top + menuRect.height > window.innerHeight - viewportPadding) {
    verticalPosition = 'above';
    top = Math.max(viewportPadding, wrapperRect.top - menuRect.height - (menuGap + 2));
  }

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.dataset.position = verticalPosition;
}

function scheduleYtrMenuPosition(menu: HTMLElement, wrapper: HTMLElement): void {
  const portalMenu = menu as PortaledYtrMenu;
  if (portalMenu.__ytrRepositionFrame) {
    cancelAnimationFrame(portalMenu.__ytrRepositionFrame);
  }

  portalMenu.__ytrRepositionFrame = requestAnimationFrame(() => {
    portalMenu.__ytrRepositionFrame = null;
    if (!menu.classList.contains('ytr-download-menu-open')) return;
    positionYtrMenu(menu, wrapper);
  });
}

function openYtrMenu(menu: HTMLElement, wrapper: HTMLElement): void {
  closeAllYtrMenus();
  closeNativeYouTubeMenus();

  const portalMenu = menu as PortaledYtrMenu;
  portalMenu.__ytrOwner = wrapper;
  if (menu.parentElement !== document.body) {
    document.body.appendChild(menu);
  }

  menu.classList.add('ytr-download-menu-open');
  setDownloadMenuScrollLock(true);
  positionYtrMenu(menu, wrapper);
  scheduleYtrMenuPosition(menu, wrapper);
}

function repositionOpenYtrMenus(): void {
  document.querySelectorAll('.ytr-download-menu-open').forEach((menuNode) => {
    const menu = menuNode as PortaledYtrMenu;
    const owner = menu.__ytrOwner;
    if (!owner?.isConnected) {
      closeAllYtrMenus();
      return;
    }
    scheduleYtrMenuPosition(menu, owner);
  });
}

function collectClassNames(value: string | null | undefined): string[] {
  return (value || '').split(/\s+/).filter(Boolean);
}

function getNativeActionButtonTemplate(anchor: Element | null): { wrapperClassName: string; buttonClassName: string } {
  const host = anchor?.parentElement?.closest('.yt-flexible-actions-view-model-wiz__action, ytd-button-renderer, button-view-model, ytd-menu-renderer') as HTMLElement | null;
  const button = (anchor instanceof HTMLButtonElement ? anchor : anchor?.querySelector('button')) as HTMLButtonElement | null;
  return {
    wrapperClassName: host?.className?.trim() || '',
    buttonClassName: button?.className?.trim() || '',
  };
}

function applyNativeActionWrapperClasses(wrapper: HTMLElement, anchor: Element | null, extraClasses: string[]): void {
  const template = getNativeActionButtonTemplate(anchor);
  const classes = new Set<string>(extraClasses);
  for (const className of collectClassNames(template.wrapperClassName)) {
    classes.add(className);
  }
  wrapper.className = [...classes].join(' ');
  wrapper.dataset.ytrNative = template.wrapperClassName ? 'true' : 'false';
}

function applyNativeActionButtonClasses(button: HTMLButtonElement, anchor: Element | null, extraClasses: string[] = []): void {
  const template = getNativeActionButtonTemplate(anchor);
  const classes = new Set<string>(extraClasses);
  for (const className of collectClassNames(template.buttonClassName)) {
    classes.add(className);
  }
  button.className = [...classes].join(' ');
  button.dataset.ytrNative = template.buttonClassName ? 'true' : 'false';
}

type DownloadThumbnailVariant = {
  candidates: string[];
  label: string;
  filenameSuffix: string;
  kind: 'original' | 'creator-test' | 'youtube-test';
  metaLabel: string;
  order: number;
};

type LoadedDownloadThumbnail = DownloadThumbnailVariant & {
  url: string;
  el: HTMLImageElement;
  hash?: string | null;
};

const DOWNLOAD_THUMBNAIL_BASE_NAMES = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default'] as const;

function buildThumbnailCandidateUrls(videoId: string, names: string[]): string[] {
  const baseUrl = `https://i.ytimg.com/vi/${videoId}/`;
  const seen = new Set<string>();
  return names
    .map((name) => `${baseUrl}${name}.jpg`)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function normalizeThumbnailUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    const entries = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    parsed.search = '';
    for (const [key, value] of entries) {
      parsed.searchParams.append(key, value);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function getDownloadThumbnailVariants(videoId: string): DownloadThumbnailVariant[] {
  return [
    {
      candidates: buildThumbnailCandidateUrls(videoId, [
        'maxresdefault',
        'sddefault',
        'hqdefault',
        'mqdefault',
        'default',
      ]),
      label: 'Original',
      filenameSuffix: 'original',
      kind: 'original',
      metaLabel: '',
      order: 0,
    },
  ];
}

function setupDownloadThumbnailButton(s: Settings): void {
  const screenshotEnabled = !!s.betaVideoFrameScreenshot;
  const downloadEnabled = !!s.downloadThumbnailButton;
  const isWatchPage = window.location.pathname === '/watch';

  if (!isWatchPage || (!downloadEnabled && !screenshotEnabled)) {
    document.querySelectorAll('.ytr-download-btn, .ytr-screenshot-btn-wrap').forEach((el) => el.remove());
    downloadBtnInjected = false;
    return;
  }

  const injectButton = () => {
    const downloadEnabled = !!currentSettings?.downloadThumbnailButton;
    const screenshotEnabledNow = !!currentSettings?.betaVideoFrameScreenshot;
    if (!downloadEnabled && !screenshotEnabledNow) return;

    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) {
      document.querySelectorAll('.ytr-download-btn, .ytr-screenshot-btn-wrap').forEach((el) => el.remove());
      return;
    }

    const moreBtn = document.querySelector('ytd-watch-metadata ytd-menu-renderer yt-button-shape.ytd-menu-renderer, ytd-watch-metadata ytd-menu-renderer #button-shape');
    const insertTarget = moreBtn?.parentElement || document.querySelector('ytd-watch-metadata #actions-inner, ytd-watch-metadata #actions, #top-level-buttons-computed');
    if (!insertTarget) return;
    const nativeActionAnchor = moreBtn instanceof Element
      ? moreBtn
      : insertTarget.querySelector('button, #button-shape, yt-button-shape');

    const isRu = getContentLocale() === 'ru';
    let screenshotWrapper = document.querySelector('.ytr-screenshot-btn-wrap') as HTMLDivElement | null;
    let downloadWrapper = document.querySelector('.ytr-download-btn') as HTMLDivElement | null;

    if (screenshotWrapper?.dataset.videoId !== videoId) {
      screenshotWrapper?.remove();
      screenshotWrapper = null;
    }
    if (downloadWrapper?.dataset.videoId !== videoId) {
      downloadWrapper?.remove();
      downloadWrapper = null;
    }

    if (!screenshotEnabledNow && screenshotWrapper) {
      screenshotWrapper.remove();
      screenshotWrapper = null;
    }
    if (!downloadEnabled && downloadWrapper) {
      downloadWrapper.remove();
      downloadWrapper = null;
    }

    const insertAfterMore = (node: HTMLElement) => {
      if (moreBtn?.parentElement) {
        if (moreBtn.nextSibling) {
          moreBtn.parentElement.insertBefore(node, moreBtn.nextSibling);
        } else {
          moreBtn.parentElement.appendChild(node);
        }
      } else {
        insertTarget.appendChild(node);
      }
    };

    const insertAfterNode = (node: HTMLElement, anchor: HTMLElement) => {
      if (anchor.parentElement) {
        if (anchor.nextSibling) {
          anchor.parentElement.insertBefore(node, anchor.nextSibling);
        } else {
          anchor.parentElement.appendChild(node);
        }
      } else {
        insertAfterMore(node);
      }
    };

    if (screenshotEnabledNow && !screenshotWrapper) {
      screenshotWrapper = createScreenshotAction(videoId, isRu, nativeActionAnchor);
    }

    if (screenshotEnabledNow && screenshotWrapper) {
      applyNativeActionWrapperClasses(screenshotWrapper, nativeActionAnchor, ['ytr-utility-btn-wrap', 'ytr-screenshot-btn-wrap']);
      const screenshotButton = screenshotWrapper.querySelector('button');
      if (screenshotButton) {
        applyNativeActionButtonClasses(screenshotButton, nativeActionAnchor, ['ytr-action-btn', 'ytr-action-btn-screenshot']);
      }
      if (downloadWrapper?.parentElement) {
        downloadWrapper.parentElement.insertBefore(screenshotWrapper, downloadWrapper);
      } else {
        insertAfterMore(screenshotWrapper);
      }
    }

    if (downloadEnabled && !downloadWrapper) {
      downloadWrapper = document.createElement('div');
      downloadWrapper.className = 'ytr-download-btn ytr-utility-btn-wrap';
      downloadWrapper.dataset.videoId = videoId;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = isRu ? 'Скачать и посмотреть превью' : 'Download and preview thumbnails';
      btn.setAttribute('aria-label', isRu ? 'Скачать и посмотреть превью' : 'Download and preview thumbnails');
      btn.innerHTML = `<svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M480-320 280-520l42-44 128 128v-324h60v324l128-128 42 44-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h60v120h520v-120h60v120q0 33-23.5 56.5T720-160H240Z"/></svg>`;

      const menu = document.createElement('div');
      menu.className = 'ytr-download-menu';

      const previewVariant = getDownloadThumbnailVariants(videoId)[0];
      let loadedThumb: LoadedDownloadThumbnail | null = null;
      let thumbnailPrepared = false;

      const previewButton = document.createElement('button');
      previewButton.className = 'ytr-download-preview';
      previewButton.type = 'button';
      previewButton.title = isRu ? 'Открыть превью' : 'Open thumbnail preview';
      previewButton.disabled = true;

      const previewImage = document.createElement('img');
      previewImage.alt = previewVariant.label;
      previewImage.className = 'ytr-download-preview-img';
      previewImage.loading = 'eager';
      previewImage.decoding = 'async';
      previewImage.crossOrigin = 'anonymous';

      const previewLabel = document.createElement('div');
      previewLabel.className = 'ytr-download-preview-label';
      previewLabel.textContent = isRu ? 'Открыть превью' : 'Click to preview';

      previewButton.appendChild(previewImage);
      previewButton.appendChild(previewLabel);
      menu.appendChild(previewButton);

      previewButton.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!loadedThumb) return;
        showImageOverlay(
          loadedThumb.url,
          `thumbnail-${videoId}-${loadedThumb.filenameSuffix}.jpg`,
          [{
            src: loadedThumb.url,
            filename: `thumbnail-${videoId}-${loadedThumb.filenameSuffix}.jpg`,
            label: loadedThumb.label,
            kind: loadedThumb.kind,
            metaLabel: loadedThumb.metaLabel,
          }],
          0,
          { drawing: true },
        );
      });

      function prepareThumbnail() {
        if (thumbnailPrepared) return;
        thumbnailPrepared = true;

        const loadCandidate = (candidateIndex: number) => {
          if (!downloadWrapper?.isConnected) return;
          const nextUrl = previewVariant.candidates[candidateIndex];
          if (!nextUrl) {
            previewButton.disabled = true;
            return;
          }
          previewImage.dataset.candidateIndex = String(candidateIndex);
          previewImage.src = nextUrl;
        };

        previewImage.addEventListener('error', () => {
          const candidateIndex = Number.parseInt(previewImage.dataset.candidateIndex || '0', 10);
          loadCandidate(candidateIndex + 1);
        });

        previewImage.addEventListener('load', () => {
          if (!downloadWrapper?.isConnected) return;

          const candidateIndex = Number.parseInt(previewImage.dataset.candidateIndex || '0', 10);
          const isLastCandidate = candidateIndex >= previewVariant.candidates.length - 1;
          const hasMeaningfulSize = previewImage.naturalWidth > MIN_FALLBACK_THUMBNAIL_WIDTH
            && previewImage.naturalHeight > MIN_FALLBACK_THUMBNAIL_HEIGHT;

          if (!hasMeaningfulSize && !isLastCandidate) {
            loadCandidate(candidateIndex + 1);
            return;
          }

          if (previewImage.naturalWidth <= 0 || previewImage.naturalHeight <= 0) {
            previewButton.disabled = true;
            return;
          }

          loadedThumb = {
            ...previewVariant,
            url: normalizeThumbnailUrl(previewImage.currentSrc || previewImage.src),
            el: previewImage,
            hash: getImageFingerprint(previewImage),
          };
          previewButton.disabled = false;

          if (downloadWrapper && menu.classList.contains('ytr-download-menu-open')) {
            scheduleYtrMenuPosition(menu, downloadWrapper);
          }
        });

        loadCandidate(0);
      }

      const thumbItem = document.createElement('button');
      thumbItem.className = 'ytr-download-menu-item';
      thumbItem.type = 'button';
      thumbItem.innerHTML = `<svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor"><path d="M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm86-157h429q9 0 13-8t-1-16L590-457q-5-6-12-6t-12 6L446-302l-81-111q-5-6-12-6t-12 6l-86 112q-6 8-2 16t13 8Z"/></svg><span>${isRu ? 'Скачать превью' : 'Download thumbnail'}</span>`;
      thumbItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllYtrMenus();
        const downloadUrl = loadedThumb?.url || previewVariant.candidates[0];
        void triggerDownload(downloadUrl, `thumbnail-${videoId}-${previewVariant.filenameSuffix}.jpg`);
      });

      const videoItem = document.createElement('button');
      videoItem.className = 'ytr-download-menu-item';
      videoItem.type = 'button';
      videoItem.innerHTML = `<svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor"><path d="M235-333h340q9 0 13-8t-1-16l-99-135q-2-3-5-4.5t-7-1.5q-4 0-7 1.5t-5 4.5l-82 109q-2 3-5.5 4t-6.5 1q-3 0-6.5-1t-5.5-4l-47-60q-2-3-5.5-4t-6.5-1q-3 0-6.5 1.5T287-442l-64 85q-5 8-1 16t13 8Zm-95 173q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h520q24 0 42 18t18 42v215l134-134q7-7 16.5-3.5T880-649v338q0 10-9.5 13.5T854-301L720-435v215q0 24-18 42t-42 18H140Z"/></svg><span>${isRu ? 'Скачать видео' : 'Download video'}</span>`;
      videoItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllYtrMenus();
        window.open(`https://en.savefrom.net/1-youtube-video-downloader-430/?url=https://www.youtube.com/watch?v=${videoId}`, '_blank');
      });

      menu.appendChild(thumbItem);
      menu.appendChild(videoItem);

      const portaledMenu = menu as PortaledYtrMenu;
      if (!portaledMenu.__ytrResizeObserver) {
        portaledMenu.__ytrResizeObserver = new ResizeObserver(() => {
          if (downloadWrapper && menu.classList.contains('ytr-download-menu-open')) {
            scheduleYtrMenuPosition(menu, downloadWrapper);
          }
        });
        portaledMenu.__ytrResizeObserver.observe(menu);
      }

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (menu.classList.contains('ytr-download-menu-open')) {
          closeAllYtrMenus();
        } else {
          prepareThumbnail();
          openYtrMenu(menu, downloadWrapper!);
        }
      });

      if (!downloadMenuCloseHandler) {
        downloadMenuCloseHandler = () => closeAllYtrMenus();
        document.addEventListener('click', downloadMenuCloseHandler);
      }

      if (!downloadMenuViewportListenerAdded) {
        downloadMenuViewportListenerAdded = true;
        window.addEventListener('resize', repositionOpenYtrMenus);
      }

      downloadWrapper.appendChild(btn);
      downloadWrapper.appendChild(menu);
    }

    if (downloadWrapper) {
      applyNativeActionWrapperClasses(downloadWrapper, nativeActionAnchor, ['ytr-download-btn', 'ytr-utility-btn-wrap']);
      const downloadButton = downloadWrapper.querySelector('button');
      if (downloadButton) {
        applyNativeActionButtonClasses(downloadButton, nativeActionAnchor, ['ytr-action-btn']);
      }
    }

    if (downloadEnabled && downloadWrapper) {
      if (screenshotWrapper?.parentElement) {
        insertAfterNode(downloadWrapper, screenshotWrapper);
      } else {
        insertAfterMore(downloadWrapper);
      }
    }
  };

  if (!downloadNavListenerAdded) {
    downloadNavListenerAdded = true;
    document.addEventListener('yt-navigate-finish', () => {
      scheduleDownloadButtonInjection(injectButton, [900, 2200]);
    });
  }

  scheduleDownloadButtonInjection(injectButton, [900, 2200]);
}

// --- Fullscreen Detection (hide timer overlay) ---

let fullscreenDetectionSetup = false;

function setupFullscreenDetection(): void {
  if (fullscreenDetectionSetup) return;
  fullscreenDetectionSetup = true;
  const updateFullscreen = () => {
    const isFs = !!document.fullscreenElement ||
      !!document.querySelector('ytd-watch-flexy[fullscreen]');
    document.documentElement.dataset.ytrFullscreen = String(isFs);
  };

  document.addEventListener('fullscreenchange', updateFullscreen);
  // YouTube may toggle fullscreen attribute without native fullscreen API
  document.addEventListener('yt-navigate-finish', () => setTimeout(updateFullscreen, 500));
  // Also observe the player's fullscreen attribute
  const checkPlayerFs = () => {
    const player = document.querySelector('ytd-watch-flexy');
    if (!player) return;
    if (observedFullscreenPlayer === player && playerFullscreenObserver) return;

    playerFullscreenObserver?.disconnect();
    observedFullscreenPlayer = player;
    playerFullscreenObserver = new MutationObserver(updateFullscreen);
    playerFullscreenObserver.observe(player, { attributes: true, attributeFilter: ['fullscreen'] });
  };
  setTimeout(checkPlayerFs, 2000);
  document.addEventListener('yt-navigate-finish', () => setTimeout(checkPlayerFs, 1500));
}

// --- MutationObserver ---

let pendingFlags = 0; // bitmask: 1=explore, 2=sidebar, 4=action, 8=feed
let rafId = 0;

function getActiveScanFlags(): number {
  let flags = 0;
  if (needsExploreTags()) flags |= 1;
  if (needsSidebarTags()) flags |= 2;
  if (needsActionTags()) flags |= 4;
  if (needsFeedTags()) flags |= 8;
  return flags;
}

function flushPending(): void {
  rafId = 0;
  const flags = pendingFlags;
  pendingFlags = 0;
  syncPageContextFlags();
  if (flags & 1) tagExploreSections();
  if (flags & 2) tagSidebarSections();
  if (flags & 4) tagActionButtons();
  if (flags & 8) tagFeedItems();
}

function scheduleScan(flag: number): void {
  if (!flag) return;
  pendingFlags |= flag;
  if (!rafId) rafId = requestAnimationFrame(flushPending);
}

function getObservedScanTargets(): Array<{ root: Element; flags: number }> {
  const targets: Array<{ root: Element; flags: number }> = [];
  const exploreFlags = needsExploreTags() ? 1 : 0;
  const feedFlags = needsFeedTags() ? 8 : 0;

  const homeRoot = document.querySelector('ytd-browse[page-subtype="home"]');
  if (homeRoot && (exploreFlags || feedFlags)) {
    targets.push({ root: homeRoot, flags: exploreFlags | feedFlags });
  }

  const searchRoot = document.querySelector('ytd-search');
  if (searchRoot && feedFlags) {
    targets.push({ root: searchRoot, flags: feedFlags });
  }

  const guideRoot = document.querySelector('ytd-guide-renderer, tp-yt-app-drawer #guide-content');
  if (guideRoot && needsSidebarTags()) {
    targets.push({ root: guideRoot, flags: 2 });
  }

  const watchActionsRoot = document.querySelector('ytd-watch-metadata');
  if (watchActionsRoot && needsActionTags()) {
    targets.push({ root: watchActionsRoot, flags: 4 });
  }

  return targets;
}

function refreshObservedScanRoots(): void {
  if (!documentScanObserver) return;
  documentScanObserver.disconnect();

  if (!getActiveScanFlags()) return;

  for (const { root } of getObservedScanTargets()) {
    documentScanObserver.observe(root, {
      childList: true,
      subtree: true,
    });
  }
}

function startObserver(): void {
  if (documentScanObserver) return;

  documentScanObserver = new MutationObserver((mutations) => {
    const activeFlags = getActiveScanFlags();
    if (!activeFlags) return;

    let flags = 0;

    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      if (isObserverIgnoredNode(mutation.target)) continue;

      const target = mutation.target as Element;
      if (!(flags & 2) && needsSidebarTags() && target.closest('ytd-guide-renderer, tp-yt-app-drawer, #guide-content')) {
        flags |= 2;
      }
      if (!(flags & 4) && needsActionTags() && target.closest('ytd-watch-metadata')) {
        flags |= 4;
      }
      if (target.closest('ytd-browse[page-subtype="home"]')) {
        if (!(flags & 1) && needsExploreTags()) flags |= 1;
        if (!(flags & 8) && needsFeedTags()) flags |= 8;
      }
      if (!(flags & 8) && needsFeedTags() && target.closest('ytd-search')) {
        flags |= 8;
      }

      if (flags === 15) break;
    }

    if (flags) scheduleScan(flags);
  });

  refreshObservedScanRoots();

  // Initial scan after YouTube renders content
  const initialFlags = getActiveScanFlags();
  if (initialFlags) {
    fullScanTimers.forEach((timer) => clearTimeout(timer));
    fullScanTimers = [800, 2500].map((delay) => window.setTimeout(() => scheduleScan(initialFlags), delay));
  }

  // Re-scan on YouTube SPA navigation (page changes without full reload)
  document.addEventListener('yt-navigate-finish', () => {
    refreshObservedScanRoots();
    const navigationFlags = getActiveScanFlags();
    if (!navigationFlags) return;
    fullScanTimers.forEach((timer) => clearTimeout(timer));
    fullScanTimers = [500, 2000].map((delay) => window.setTimeout(() => scheduleScan(navigationFlags), delay));
  });
}
