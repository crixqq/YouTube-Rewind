import type { Settings } from '@/lib/settings';
import { loadSettings, addWatchTime, getWatchTime, getBlockDismissed, setBlockDismissed, QUALITY_MAP } from '@/lib/settings';
import './style.css';

let currentSettings: Settings | null = null;
type OverlayGalleryItem = { src: string; filename: string; label: string };
type CaptureVisibleTabResponse = { dataUrl?: string; error?: string };
let feedRevealObserver: IntersectionObserver | null = null;

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',

  async main() {
    const settings = await loadSettings();
    currentSettings = settings;
    applySettings(settings);
    scheduleCustomLogoSync();
    startObserver();
    setupPlaybackSpeed(settings);
    setupDefaultQuality(settings);
    setupWatchTimer(settings);
    setupDownloadThumbnailButton(settings);
    setupFullscreenDetection();
    document.addEventListener('yt-navigate-finish', () => {
      scheduleCustomLogoSync(240);
      scheduleCustomLogoSync(960);
      setTimeout(syncFeedRevealObserver, 180);
      setTimeout(syncFeedRevealObserver, 560);
    });

    browser.storage.onChanged.addListener((changes) => {
      if (changes.ytr_settings?.newValue) {
        const s = changes.ytr_settings.newValue as Settings;
        currentSettings = s;
        applySettings(s);
        scheduleCustomLogoSync();
        syncFeedRevealObserver();
        tagExploreSections();
        tagSidebarSections();
        tagActionButtons();
        tagFeedItems();
        setupPlaybackSpeed(s);
        setupDefaultQuality(s);
        setupWatchTimer(s);
        setupDownloadThumbnailButton(s);
      }
    });
  },
});

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

  // Inject pixel filter SVG only when needed
  if (s.thumbnailEffect === 'pixelate') injectPixelFilter();

  if (s.videosPerRow > 0) {
    d.ytrVideosPerRow = String(s.videosPerRow);
    el.style.setProperty('--ytr-videos-per-row', String(s.videosPerRow));
    setupPrefetch();
  } else {
    delete d.ytrVideosPerRow;
    el.style.removeProperty('--ytr-videos-per-row');
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

  // Custom logo
  if (s.customLogo) {
    d.ytrCustomLogo = 'true';
    el.style.setProperty('--ytr-custom-logo', `url("${s.customLogo}")`);
    el.style.setProperty('--ytr-custom-logo-ratio', String(s.customLogoRatio || 'auto'));
    el.style.setProperty('--ytr-custom-logo-scale', String((s.customLogoScale || 100) / 100));
    // Auto-hide logo animation when custom logo is set, unless user explicitly disabled this
    d.ytrHideLogoAnimation = String(s.hideLogoAnimation !== false);
  } else {
    delete d.ytrCustomLogo;
    el.style.removeProperty('--ytr-custom-logo');
    el.style.removeProperty('--ytr-custom-logo-ratio');
    el.style.removeProperty('--ytr-custom-logo-scale');
    d.ytrHideLogoAnimation = String(s.hideLogoAnimation);
  }
  syncCustomLogoElement(s);

  // Playables
  d.ytrHidePlayables = String(s.hidePlayables);
  d.ytrHideFilterBar = String(s.hideFilterBar);
  d.ytrDisableAvatarLive = String(!!(s.betaEnabled && s.disableAvatarLiveRedirect));
  d.ytrBetaFeedMotion = String(!!(s.betaEnabled && s.betaHomepageRevealAnimation));

}

function isVideoLogo(src: string): boolean {
  return /^data:video\//i.test(src) || /\.(mp4|webm|ogg|mov)(?:$|[?#])/i.test(src);
}

function syncCustomLogoElement(settings: Settings | null = currentSettings): void {
  const logoLink = document.querySelector('ytd-topbar-logo-renderer a#logo') as HTMLAnchorElement | null;
  if (!logoLink) return;

  const existingSlot = logoLink.querySelector('.ytr-custom-logo-slot') as HTMLSpanElement | null;

  if (!settings?.customLogo) {
    existingSlot?.remove();
    return;
  }

  const currentMedia = existingSlot?.querySelector('.ytr-custom-logo-media') as (HTMLImageElement | HTMLVideoElement) | null;
  if (currentMedia?.dataset.src === settings.customLogo) return;

  existingSlot?.remove();

  const slot = document.createElement('span');
  slot.className = 'ytr-custom-logo-slot';
  slot.style.setProperty('--ytr-custom-logo-ratio', String(settings.customLogoRatio || 'auto'));

  if (isVideoLogo(settings.customLogo)) {
    const video = document.createElement('video');
    video.className = 'ytr-custom-logo-media';
    video.dataset.src = settings.customLogo;
    video.src = settings.customLogo;
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
  } else {
    const img = document.createElement('img');
    img.className = 'ytr-custom-logo-media';
    img.dataset.src = settings.customLogo;
    img.src = settings.customLogo;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    slot.appendChild(img);
  }

  logoLink.appendChild(slot);
}

function scheduleCustomLogoSync(delay = 0): void {
  window.setTimeout(() => syncCustomLogoElement(), delay);
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
  document.querySelectorAll('ytd-rich-section-renderer:not([data-ytr-explore-topics]):not([data-ytr-playables])').forEach((section) => {
    const text = (section.textContent || '').toLowerCase();
    if (EXPLORE_KEYWORDS.some((kw) => text.includes(kw))) {
      section.setAttribute('data-ytr-explore-topics', 'true');
    } else if (PLAYABLES_KEYWORDS.some((kw) => text.includes(kw))) {
      section.setAttribute('data-ytr-playables', 'true');
    }
  });
}

// --- Sidebar: tag sections by content ---

function tagSidebarSections(): void {
  document.querySelectorAll('ytd-guide-section-renderer:not([data-ytr-sidebar-subscriptions]):not([data-ytr-sidebar-you]):not([data-ytr-sidebar-more-yt]):not([data-ytr-sidebar-explore])').forEach((section) => {
    if (section.querySelector('ytd-guide-collapsible-section-entry-renderer')) {
      section.setAttribute('data-ytr-sidebar-subscriptions', 'true');
      return;
    }
    if (section.querySelector('a[href="/feed/history"], a[href="/feed/library"], a[href*="list=WL"], a[href*="list=LL"]')) {
      section.setAttribute('data-ytr-sidebar-you', 'true');
      return;
    }
    if (section.querySelector('a[href*="youtube.com/premium"], a[href*="/premium"], a[href*="music.youtube.com"], a[href*="/kids"]')) {
      section.setAttribute('data-ytr-sidebar-more-yt', 'true');
      return;
    }
    const title = section.querySelector('#guide-section-title');
    if (title && title.textContent?.trim()) {
      section.setAttribute('data-ytr-sidebar-explore', 'true');
    }
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
        item.setAttribute('data-ytr-feed-reveal', 'pending');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            item.setAttribute('data-ytr-feed-reveal', 'visible');
          });
        });
      } else {
        item.setAttribute('data-ytr-feed-reveal', 'pending');
      }
    });
  }, {
    threshold: 0.04,
    rootMargin: '18% 0px 18% 0px',
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
    element.style.setProperty('--ytr-feed-reveal-delay', `${Math.min(index, 6) * 28}ms`);
    if (!element.hasAttribute('data-ytr-feed-reveal')) {
      element.setAttribute('data-ytr-feed-reveal', 'pending');
    }
    observer.observe(element);
  });
}

function tagFeedItems(): void {
  const items = document.querySelectorAll(FEED_ITEM_SELECTOR);
  if (items.length === 0) {
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

  });

  syncFeedRevealObserver();
  fixAvatarLiveLinks();
}

// --- Avatar: fix live redirect on avatar clicks ---

let avatarClickListenerAdded = false;

function fixAvatarLiveLinks(): void {
  if (document.documentElement.dataset.ytrDisableAvatarLive !== 'true') return;

  // Fix href attributes on avatar links pointing to streams
  document.querySelectorAll('a:not([data-ytr-live-fixed])').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (!href.includes('/watch?v=') && !href.includes('/live/')) return;
    if (!link.querySelector('yt-avatar-shape, yt-img-shadow, img.yt-core-image')) return;

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

function setupPrefetch(): void {
  if (prefetchActive) return;
  prefetchActive = true;

  const triggerLoad = () => {
    const cont = document.querySelector('ytd-continuation-item-renderer');
    if (!cont) return;
    const rect = cont.getBoundingClientRect();
    // If the continuation sentinel is within 3x viewport height, force a resize
    // event which causes YouTube to re-evaluate its IntersectionObserver
    if (rect.top < window.innerHeight * 3) {
      window.dispatchEvent(new Event('resize'));
    }
  };

  window.addEventListener('scroll', () => requestAnimationFrame(triggerLoad), { passive: true });
  // Also trigger on initial load
  setTimeout(triggerLoad, 1500);
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

// --- v0.4.0: Playback Speed Memory ---

let speedListenersSetup = false;
let speedAppliedForNav = false;

function setupPlaybackSpeed(s: Settings): void {
  if (s.playbackSpeed <= 0) return;

  const applySpeed = () => {
    if (speedAppliedForNav) return; // Already applied for this navigation — let user change freely
    const video = document.querySelector('video') as HTMLVideoElement | null;
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
      speedAppliedForNav = false;
      setTimeout(applySpeed, 1000);
      setTimeout(applySpeed, 3000);
    });
  }

  // Apply on initial load / settings change (reset flag so it applies once)
  speedAppliedForNav = false;
  setTimeout(applySpeed, 500);
  setTimeout(applySpeed, 2000);
}

// --- v0.4.0: Default Video Quality ---

let qualitySetup = false;
let qualityRetryTimer: number | null = null;
let qualityAttemptToken = 0;
const QUALITY_LABELS_BY_HEIGHT: Record<number, string> = {
  4320: 'highres',
  2160: 'hd2160',
  1440: 'hd1440',
  1080: 'hd1080',
  720: 'hd720',
  480: 'large',
  360: 'medium',
  240: 'small',
  144: 'tiny',
};
const QUALITY_HEIGHT_BY_LABEL = Object.fromEntries(
  Object.entries(QUALITY_LABELS_BY_HEIGHT).map(([height, label]) => [label, Number(height)]),
) as Record<string, number>;

function clearQualityRetry(): void {
  if (qualityRetryTimer) {
    clearTimeout(qualityRetryTimer);
    qualityRetryTimer = null;
  }
}

function getPreferredQualityLabel(targetQuality: string, available: string[]): string | null {
  const targetHeight = QUALITY_MAP[targetQuality] || 0;
  if (!targetHeight) return null;

  const candidates = available
    .map((label) => ({
      label,
      height: QUALITY_HEIGHT_BY_LABEL[label] ?? 0,
    }))
    .filter((candidate) => candidate.height > 0);

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const distanceDiff = Math.abs(a.height - targetHeight) - Math.abs(b.height - targetHeight);
    if (distanceDiff !== 0) return distanceDiff;

    const overshootPenaltyA = a.height >= targetHeight ? 1 : 0;
    const overshootPenaltyB = b.height >= targetHeight ? 1 : 0;
    if (overshootPenaltyA !== overshootPenaltyB) return overshootPenaltyA - overshootPenaltyB;

    return b.height - a.height;
  });

  return candidates[0]?.label || null;
}

function applyDefaultQualityOnce(): boolean {
  const settings = currentSettings;
  if (!settings || settings.defaultQuality === 'auto') return true;

  const player = document.querySelector('#movie_player') as {
    getAvailableQualityLevels?: () => string[];
    getPlaybackQuality?: () => string;
    setPlaybackQuality?: (quality: string) => void;
    setPlaybackQualityRange?: (minQuality: string, maxQuality?: string) => void;
  } | null;

  if (!player?.getAvailableQualityLevels) return false;

  const available = player.getAvailableQualityLevels().filter(Boolean);
  if (!available.length) return false;

  const preferredLabel = getPreferredQualityLabel(settings.defaultQuality, available);
  if (!preferredLabel) return false;

  try {
    player.setPlaybackQualityRange?.(preferredLabel, preferredLabel);
    player.setPlaybackQuality?.(preferredLabel);
    return player.getPlaybackQuality?.() === preferredLabel || true;
  } catch {
    return false;
  }
}

function scheduleDefaultQualityEnforcement(delay = 0): void {
  clearQualityRetry();
  qualityAttemptToken += 1;
  const token = qualityAttemptToken;

  window.setTimeout(() => {
    let attempts = 0;

    const tick = () => {
      if (token !== qualityAttemptToken) return;
      if (!currentSettings || currentSettings.defaultQuality === 'auto') return;

      applyDefaultQualityOnce();
      attempts += 1;

      if (attempts >= 12) {
        qualityRetryTimer = null;
        return;
      }

      const nextDelay = attempts < 4 ? 450 : 950;
      qualityRetryTimer = window.setTimeout(tick, nextDelay);
    };

    tick();
  }, delay);
}

function setupDefaultQuality(s: Settings): void {
  if (!qualitySetup) {
    qualitySetup = true;
    document.addEventListener('yt-navigate-finish', () => {
      scheduleDefaultQualityEnforcement(200);
    });
    document.addEventListener('loadedmetadata', (event) => {
      if (event.target instanceof HTMLVideoElement) {
        scheduleDefaultQualityEnforcement(120);
      }
    }, true);
    document.addEventListener('canplay', (event) => {
      if (event.target instanceof HTMLVideoElement) {
        scheduleDefaultQualityEnforcement(80);
      }
    }, true);
  }

  if (s.defaultQuality === 'auto') {
    clearQualityRetry();
    return;
  }

  scheduleDefaultQualityEnforcement(150);
}

// --- v0.4.0: Watch Timer & Time Limit ---

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
      const video = document.querySelector('video') as HTMLVideoElement | null;
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

  const isRu = currentSettings?.language === 'ru';
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function triggerDownload(src: string, filename: string): void {
  const link = document.createElement('a');
  link.href = src;
  link.download = filename;
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    link.click();
    return;
  }
  link.target = '_blank';
  link.click();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode image'));
    image.src = src;
  });
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
  const video = document.querySelector('video') as HTMLVideoElement | null;
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

function showImageOverlay(imgSrc: string, filename: string, galleryItems: OverlayGalleryItem[] = [{ src: imgSrc, filename, label: '1' }], startIndex = 0): void {
  const existing = document.querySelector('#ytr-thumb-overlay');
  if (existing) existing.remove();
  closeAllYtrMenus();

  const isRu = currentSettings?.language === 'ru';
  const items = galleryItems.length ? galleryItems : [{ src: imgSrc, filename, label: '1' }];
  let currentIndex = clamp(startIndex, 0, items.length - 1);

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

  const stageStatus = document.createElement('div');
  stageStatus.className = 'ytr-thumb-overlay-status';
  stageStatus.textContent = isRu ? 'Загрузка превью…' : 'Loading preview…';

  const img = document.createElement('img');
  img.alt = '';
  img.className = 'ytr-thumb-overlay-img';
  img.draggable = false;
  img.decoding = 'async';

  const gallery = document.createElement('div');
  gallery.className = 'ytr-thumb-overlay-gallery';

  const galleryRow = document.createElement('div');
  galleryRow.className = 'ytr-thumb-overlay-gallery-row';

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

  const viewControls = document.createElement('div');
  viewControls.className = 'ytr-thumb-overlay-view-controls';

  const actions = document.createElement('div');
  actions.className = 'ytr-thumb-overlay-actions';

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

  viewControls.appendChild(zoomOutBtn);
  viewControls.appendChild(scaleBadge);
  viewControls.appendChild(zoomInBtn);
  viewControls.appendChild(resetBtn);

  actions.appendChild(viewControls);
  actions.appendChild(copyBtn);
  actions.appendChild(dlBtn);
  actions.appendChild(closeBtn);

  controls.appendChild(actions);
  imgWrap.appendChild(img);
  stage.appendChild(stageStatus);
  stage.appendChild(imgWrap);
  content.appendChild(stage);
  if (items.length > 1) {
    galleryRow.appendChild(galleryPrev);
    galleryRow.appendChild(gallery);
    galleryRow.appendChild(galleryNext);
    panel.appendChild(galleryRow);
  }
  panel.appendChild(controls);
  content.appendChild(panel);
  overlay.appendChild(backdrop);
  overlay.appendChild(content);

  const thumbnailButtons: HTMLButtonElement[] = [];

  const getCurrentItem = (): OverlayGalleryItem => items[currentIndex];

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
  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTouchDist = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;

  function applyTransform(animate = false) {
    const maxPanX = Math.max(img.clientWidth * scale, imgWrap.clientWidth) * 1.25;
    const maxPanY = Math.max(img.clientHeight * scale, imgWrap.clientHeight) * 1.25;
    panX = clamp(panX, -maxPanX, maxPanX);
    panY = clamp(panY, -maxPanY, maxPanY);

    img.style.transition = animate ? 'transform 0.24s cubic-bezier(0.2, 0, 0, 1)' : 'none';
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    imgWrap.style.cursor = scale !== 1 ? (isDragging ? 'grabbing' : 'grab') : 'pointer';
    scaleBadge.textContent = `${Math.round(scale * 100)}%`;
    content.dataset.zoomed = String(scale !== 1);
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

  function syncGalleryState() {
    thumbnailButtons.forEach((button, index) => {
      button.classList.toggle('active', index === currentIndex);
    });
    galleryPrev.disabled = currentIndex === 0;
    galleryNext.disabled = currentIndex === items.length - 1;
  }

  function setCurrentIndex(index: number, reset = true) {
    currentIndex = clamp(index, 0, items.length - 1);
    const nextSrc = getCurrentItem().src;
    const reusedLoadedImage = img.currentSrc === nextSrc && img.complete;
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
    syncGalleryState();
    if (reusedLoadedImage) {
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

    thumbButton.appendChild(thumbImage);
    thumbButton.addEventListener('click', (event) => {
      event.stopPropagation();
      setCurrentIndex(index);
    });
    thumbButton.title = item.label;
    thumbnailButtons.push(thumbButton);
    gallery.appendChild(thumbButton);
  });

  img.addEventListener('load', () => {
    stageStatus.hidden = true;
    applyTransform(false);
  });
  img.addEventListener('error', () => {
    stageStatus.hidden = false;
    stageStatus.textContent = isRu ? 'Не удалось загрузить превью' : 'Could not load preview';
  });

  imgWrap.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.15 : 0.15;
    const nextScale = clamp(scale + delta * scale, 0.5, 8);
    const rect = imgWrap.getBoundingClientRect();
    const cx = event.clientX - rect.left - rect.width / 2;
    const cy = event.clientY - rect.top - rect.height / 2;
    const ratio = nextScale / scale;
    panX = cx - ratio * (cx - panX);
    panY = cy - ratio * (cy - panY);
    scale = nextScale;
    applyTransform(false);
  }, { passive: false });

  imgWrap.addEventListener('click', (event) => {
    if (isDragging) return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      resetTransform();
      return;
    }

    clickTimer = setTimeout(() => {
      clickTimer = null;
      if (scale === 1) {
        const rect = imgWrap.getBoundingClientRect();
        const cx = event.clientX - rect.left - rect.width / 2;
        const cy = event.clientY - rect.top - rect.height / 2;
        const nextScale = 2;
        const ratio = nextScale / scale;
        panX = cx - ratio * (cx - panX);
        panY = cy - ratio * (cy - panY);
        scale = nextScale;
        applyTransform(true);
      }
    }, 180);
  });

  imgWrap.addEventListener('mousedown', (event) => {
    if (scale === 1) return;
    event.preventDefault();
    isDragging = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    startPanX = panX;
    startPanY = panY;

    const onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - dragStartX;
      const dy = moveEvent.clientY - dragStartY;
      if (!isDragging && Math.abs(dx) + Math.abs(dy) > 4) isDragging = true;
      panX = startPanX + dx;
      panY = startPanY + dy;
      applyTransform(false);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      imgWrap.style.cursor = scale !== 1 ? 'grab' : 'pointer';
      setTimeout(() => { isDragging = false; }, 10);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    imgWrap.style.cursor = 'grabbing';
  });

  imgWrap.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      lastTouchDist = Math.hypot(dx, dy);
      return;
    }

    if (event.touches.length === 1 && scale !== 1) {
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

    if (event.touches.length === 1 && scale !== 1) {
      panX = startPanX + (event.touches[0].clientX - lastTouchX);
      panY = startPanY + (event.touches[0].clientY - lastTouchY);
      applyTransform(false);
    }
  }, { passive: false });

  const tryCopyImage = async () => {
    copyBtn.disabled = true;
    setCopyButtonState('busy');
    const result = await copyImageToClipboard(getCurrentItem().src);
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
  };

  const remove = () => {
    overlay.remove();
    document.documentElement.classList.remove('ytr-overlay-lock-scroll');
    document.removeEventListener('keydown', handler);
  };

  function handler(event: KeyboardEvent) {
    if (event.key === 'Escape') remove();
    if (event.key === '0' || event.key.toLowerCase() === 'r') resetTransform();
    if (event.key === '+' || event.key === '=') zoomBy(1.3);
    if (event.key === '-') zoomBy(1 / 1.3);
    if (event.key.toLowerCase() === 'c') void tryCopyImage();
    if (event.key === 'ArrowLeft' && items.length > 1) setCurrentIndex(currentIndex - 1);
    if (event.key === 'ArrowRight' && items.length > 1) setCurrentIndex(currentIndex + 1);
  }

  backdrop.addEventListener('click', remove);
  closeBtn.addEventListener('click', remove);
  zoomOutBtn.addEventListener('click', (event) => { event.stopPropagation(); zoomBy(1 / 1.25); });
  zoomInBtn.addEventListener('click', (event) => { event.stopPropagation(); zoomBy(1.25); });
  resetBtn.addEventListener('click', (event) => { event.stopPropagation(); resetTransform(); });
  copyBtn.addEventListener('click', (event) => { event.stopPropagation(); void tryCopyImage(); });
  dlBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const currentItem = getCurrentItem();
    const a = document.createElement('a');
    a.href = currentItem.src;
    a.download = currentItem.filename;
    if (currentItem.src.startsWith('data:') || currentItem.src.startsWith('blob:')) {
      a.click();
    } else {
      a.target = '_blank';
      a.click();
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
  document.body.appendChild(overlay);
  document.addEventListener('keydown', handler);
  document.documentElement.classList.add('ytr-overlay-lock-scroll');
  requestAnimationFrame(() => {
    setCurrentIndex(currentIndex, true);
    overlay.focus();
    applyTransform(false);
  });
}

function createScreenshotAction(videoId: string, isRu: boolean, nativeActionAnchor: Element | null): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'ytr-utility-btn-wrap ytr-screenshot-btn-wrap';
  applyNativeActionWrapperClasses(wrapper, nativeActionAnchor, ['ytr-utility-btn-wrap', 'ytr-screenshot-btn-wrap']);

  const button = document.createElement('button');
  button.type = 'button';
  button.title = isRu ? 'Сделать скриншот кадра' : 'Capture frame screenshot';
  button.setAttribute('aria-label', isRu ? 'Сделать скриншот кадра' : 'Capture frame screenshot');
  applyNativeActionButtonClasses(button, nativeActionAnchor, ['ytr-action-btn', 'ytr-action-btn-screenshot']);
  button.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M9 4.5 7.78 6H5.25C4.56 6 4 6.56 4 7.25v9.5c0 .69.56 1.25 1.25 1.25h13.5c.69 0 1.25-.56 1.25-1.25v-9.5C20 6.56 19.44 6 18.75 6h-2.53L15 4.5H9Zm3 10.75a3.25 3.25 0 1 1 0-6.5 3.25 3.25 0 0 1 0 6.5Zm0-1.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z"/></svg>`;

  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (button.disabled) return;

    button.disabled = true;
    wrapper.dataset.busy = 'true';

    try {
      const shot = await captureCurrentVideoFrame(videoId);
      if (currentSettings?.betaEnabled && currentSettings.betaScreenshotOpenPreview) {
        showImageOverlay(shot.dataUrl, shot.filename);
      } else {
        triggerDownload(shot.dataUrl, shot.filename);
        showYtrToast(isRu ? 'Скриншот сохранён' : 'Screenshot downloaded');
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

// --- v0.4.0: Download Button (Thumbnail + Video) ---

let downloadBtnInjected = false;
let downloadNavListenerAdded = false;
let downloadMenuCloseHandler: (() => void) | null = null;
let downloadMenuViewportListenerAdded = false;

function closeAllYtrMenus(): void {
  const openMenus = document.querySelectorAll('.ytr-download-menu-open') as NodeListOf<HTMLElement>;
  openMenus.forEach((menu) => {
    menu.classList.remove('ytr-download-menu-open');
    menu.style.removeProperty('left');
    menu.style.removeProperty('top');
    menu.style.removeProperty('bottom');

    const owner = (menu as HTMLElement & { __ytrOwner?: HTMLElement | null }).__ytrOwner;
    if (owner && menu.parentElement !== owner) {
      owner.appendChild(menu);
    }
  });
}

function openYtrMenu(menu: HTMLElement, wrapper: HTMLElement): void {
  closeAllYtrMenus();
  // Close YouTube's own popup menus
  document.querySelectorAll('tp-yt-iron-dropdown[style*="display"]').forEach((d) => {
    (d as HTMLElement).style.display = 'none';
  });

  const portalMenu = menu as HTMLElement & { __ytrOwner?: HTMLElement | null };
  portalMenu.__ytrOwner = wrapper;
  if (menu.parentElement !== document.body) {
    document.body.appendChild(menu);
  }

  menu.classList.add('ytr-download-menu-open');
  menu.style.bottom = 'auto';
  const menuRect = menu.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const viewportPadding = 12;

  let left = wrapperRect.right - menuRect.width;
  left = clamp(left, viewportPadding, window.innerWidth - menuRect.width - viewportPadding);

  let top = wrapperRect.bottom + 8;
  if (top + menuRect.height > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, wrapperRect.top - menuRect.height - 8);
  }

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
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

function setupDownloadThumbnailButton(s: Settings): void {
  const screenshotEnabled = !!(s.betaEnabled && s.betaVideoFrameScreenshot);
  const downloadEnabled = !!(s.betaEnabled && s.downloadThumbnailButton);

  if (!downloadEnabled && !screenshotEnabled) {
    document.querySelectorAll('.ytr-download-btn, .ytr-screenshot-btn-wrap').forEach((el) => el.remove());
    downloadBtnInjected = false;
    return;
  }

  const injectButton = () => {
    const downloadEnabled = !!(currentSettings?.betaEnabled && currentSettings.downloadThumbnailButton);
    const screenshotEnabledNow = !!(currentSettings?.betaEnabled && currentSettings.betaVideoFrameScreenshot);
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

    const isRu = currentSettings?.language === 'ru';
    let screenshotWrapper = document.querySelector('.ytr-screenshot-btn-wrap') as HTMLDivElement | null;
    let downloadWrapper = document.querySelector('.ytr-download-btn') as HTMLDivElement | null;

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

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = isRu ? 'Скачать и посмотреть превью' : 'Download and preview thumbnails';
      btn.setAttribute('aria-label', isRu ? 'Скачать и посмотреть превью' : 'Download and preview thumbnails');
      btn.innerHTML = `<svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor"><path d="M469-327q-5-2-10-7L308-485q-9-9.27-8.5-21.64.5-12.36 9.11-21.36 9.39-9 21.89-9t21.5 9l98 99v-341q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v341l99-99q8.8-9 20.9-8.5 12.1.5 21.49 9.5 8.61 9 8.61 21.5t-9 21.5L501-334q-5 5-10.13 7-5.14 2-11 2-5.87 0-10.87-2ZM220-160q-24 0-42-18t-18-42v-113q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v113h520v-113q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v113q0 24-18 42t-42 18H220Z"/></svg>`;

      const menu = document.createElement('div');
      menu.className = 'ytr-download-menu';

      const carouselOuter = document.createElement('div');
      carouselOuter.className = 'ytr-carousel';

      const carouselViewport = document.createElement('div');
      carouselViewport.className = 'ytr-carousel-viewport';

      const track = document.createElement('div');
      track.className = 'ytr-carousel-track';

      const thumbVariants = [
        { url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, label: 'Main' },
        { url: `https://img.youtube.com/vi/${videoId}/maxres1.jpg`, label: 'B' },
        { url: `https://img.youtube.com/vi/${videoId}/maxres2.jpg`, label: 'C' },
        { url: `https://img.youtube.com/vi/${videoId}/maxres3.jpg`, label: 'D' },
      ];
      const loadedThumbs: { url: string; label: string; el: HTMLImageElement; order: number }[] = [];
      let carouselIdx = 0;

      for (const [variantIndex, variant] of thumbVariants.entries()) {
        const img = document.createElement('img');
        img.src = variant.url;
        img.alt = variant.label;
        img.className = 'ytr-carousel-img';
        img.style.display = 'none';
        img.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const galleryItems = loadedThumbs.map((thumb) => ({
            src: thumb.url,
            filename: `thumbnail-${videoId}-${thumb.label.toLowerCase()}.jpg`,
            label: thumb.label,
          }));
          const activeIndex = Math.max(0, galleryItems.findIndex((thumb) => thumb.src === variant.url));
          showImageOverlay(
            variant.url,
            `thumbnail-${videoId}-${variant.label.toLowerCase()}.jpg`,
            galleryItems,
            activeIndex,
          );
        });
        const removeInvalid = () => {
          img.remove();
          const idx = loadedThumbs.findIndex((t) => t.el === img);
          if (idx >= 0) loadedThumbs.splice(idx, 1);
          refreshCarousel();
        };
        img.addEventListener('error', removeInvalid);
        img.addEventListener('load', () => {
          if (img.naturalWidth <= 120) {
            removeInvalid();
            return;
          }
          img.style.display = '';
          if (!loadedThumbs.some((thumb) => thumb.el === img)) {
            loadedThumbs.push({ url: variant.url, label: variant.label, el: img, order: variantIndex });
            loadedThumbs.sort((a, b) => a.order - b.order);
          }
          refreshCarousel();
        });
        track.appendChild(img);
      }

      const prevArrow = document.createElement('button');
      prevArrow.className = 'ytr-carousel-arrow ytr-carousel-prev';
      prevArrow.type = 'button';
      prevArrow.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;
      prevArrow.addEventListener('click', (e) => { e.stopPropagation(); goSlide(-1); });

      const nextArrow = document.createElement('button');
      nextArrow.className = 'ytr-carousel-arrow ytr-carousel-next';
      nextArrow.type = 'button';
      nextArrow.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
      nextArrow.addEventListener('click', (e) => { e.stopPropagation(); goSlide(1); });

      const dotsRow = document.createElement('div');
      dotsRow.className = 'ytr-carousel-dots';

      const previewHint = document.createElement('div');
      previewHint.className = 'ytr-download-menu-hint';
      previewHint.textContent = isRu ? 'Нажми на превью, чтобы открыть его в большом просмотре' : 'Click a thumbnail to open the large preview';

      function refreshCarousel() {
        if (carouselIdx >= loadedThumbs.length) carouselIdx = Math.max(0, loadedThumbs.length - 1);
        track.style.transform = `translateX(-${carouselIdx * 100}%)`;
        prevArrow.style.visibility = carouselIdx > 0 ? 'visible' : 'hidden';
        nextArrow.style.visibility = carouselIdx < loadedThumbs.length - 1 ? 'visible' : 'hidden';
        dotsRow.innerHTML = '';
        if (loadedThumbs.length > 1) {
          for (let i = 0; i < loadedThumbs.length; i++) {
            const d = document.createElement('span');
            d.className = 'ytr-carousel-dot' + (i === carouselIdx ? ' active' : '');
            d.addEventListener('click', (e) => { e.stopPropagation(); carouselIdx = i; refreshCarousel(); });
            dotsRow.appendChild(d);
          }
        }
        carouselOuter.dataset.multi = String(loadedThumbs.length > 1);
        previewHint.style.display = loadedThumbs.length > 0 ? 'block' : 'none';
      }

      function goSlide(dir: number) {
        carouselIdx = Math.max(0, Math.min(loadedThumbs.length - 1, carouselIdx + dir));
        refreshCarousel();
      }

      carouselViewport.appendChild(track);
      carouselOuter.appendChild(prevArrow);
      carouselOuter.appendChild(carouselViewport);
      carouselOuter.appendChild(nextArrow);
      menu.appendChild(carouselOuter);
      menu.appendChild(dotsRow);
      menu.appendChild(previewHint);

      setTimeout(refreshCarousel, 50);
      setTimeout(refreshCarousel, 1500);

      const thumbItem = document.createElement('button');
      thumbItem.className = 'ytr-download-menu-item';
      thumbItem.type = 'button';
      thumbItem.innerHTML = `<svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor"><path d="M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm86-157h429q9 0 13-8t-1-16L590-457q-5-6-12-6t-12 6L446-302l-81-111q-5-6-12-6t-12 6l-86 112q-6 8-2 16t13 8Z"/></svg><span>${isRu ? 'Скачать превью' : 'Download thumbnail'}</span>`;
      thumbItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllYtrMenus();
        const cur = loadedThumbs[carouselIdx];
        if (cur) {
          triggerDownload(cur.url, `thumbnail-${videoId}${cur.label === 'Main' ? '' : '-' + cur.label.toLowerCase()}.jpg`);
        }
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

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu.classList.contains('ytr-download-menu-open')) {
          closeAllYtrMenus();
        } else {
          openYtrMenu(menu, downloadWrapper!);
          refreshCarousel();
        }
      });

      if (!downloadMenuCloseHandler) {
        downloadMenuCloseHandler = () => closeAllYtrMenus();
        document.addEventListener('click', downloadMenuCloseHandler);
      }

      if (!downloadMenuViewportListenerAdded) {
        downloadMenuViewportListenerAdded = true;
        window.addEventListener('resize', closeAllYtrMenus);
        document.addEventListener('scroll', closeAllYtrMenus, true);
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
      setTimeout(injectButton, 1000);
      setTimeout(injectButton, 3000);
    });
  }

  setTimeout(injectButton, 1500);
  setTimeout(injectButton, 3000);
}

// --- Fullscreen Detection (hide timer overlay) ---

function setupFullscreenDetection(): void {
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
    if (player) {
      const obs = new MutationObserver(updateFullscreen);
      obs.observe(player, { attributes: true, attributeFilter: ['fullscreen'] });
    }
  };
  setTimeout(checkPlayerFs, 2000);
  document.addEventListener('yt-navigate-finish', () => setTimeout(checkPlayerFs, 1500));
}

// --- MutationObserver ---

const TAGS_NEEDING_EXPLORE = new Set(['YTD-RICH-SECTION-RENDERER']);
const TAGS_NEEDING_SIDEBAR = new Set(['YTD-GUIDE-SECTION-RENDERER', 'YTD-GUIDE-RENDERER']);
const TAGS_NEEDING_ACTION = new Set(['YT-BUTTON-VIEW-MODEL', 'YTD-BUTTON-RENDERER', 'YTD-DOWNLOAD-BUTTON-RENDERER']);
const TAGS_NEEDING_FEED = new Set(['YTD-RICH-ITEM-RENDERER', 'YTD-VIDEO-RENDERER', 'YTD-COMPACT-VIDEO-RENDERER', 'YTD-GRID-VIDEO-RENDERER']);

let pendingFlags = 0; // bitmask: 1=explore, 2=sidebar, 4=action, 8=feed
let rafId = 0;

function flushPending(): void {
  rafId = 0;
  const flags = pendingFlags;
  pendingFlags = 0;
  if (flags & 1) tagExploreSections();
  if (flags & 2) tagSidebarSections();
  if (flags & 4) tagActionButtons();
  if (flags & 8) tagFeedItems();
}

function scheduleScan(flag: number): void {
  pendingFlags |= flag;
  if (!rafId) rafId = requestAnimationFrame(flushPending);
}

function startObserver(): void {
  const observer = new MutationObserver((mutations) => {
    let flags = 0;

    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const tag = node.tagName;

        if (!(flags & 1) && TAGS_NEEDING_EXPLORE.has(tag)) flags |= 1;
        if (!(flags & 2) && TAGS_NEEDING_SIDEBAR.has(tag)) flags |= 2;
        if (!(flags & 4) && (TAGS_NEEDING_ACTION.has(tag) || node.id === 'top-level-buttons-computed')) flags |= 4;
        if (!(flags & 8) && TAGS_NEEDING_FEED.has(tag)) flags |= 8;
        // YTD-BROWSE triggers all scans (full page navigation)
        if (tag === 'YTD-BROWSE') { flags = 15; break; }

        if (flags === 15) break;
      }
      if (flags === 15) break;
    }

    if (flags) scheduleScan(flags);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial scan after YouTube renders content
  setTimeout(() => scheduleScan(15), 800);
  setTimeout(() => scheduleScan(15), 2500);

  // Re-scan on YouTube SPA navigation (page changes without full reload)
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => scheduleScan(15), 500);
    setTimeout(() => scheduleScan(15), 2000);
  });
}
