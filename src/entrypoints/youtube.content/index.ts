import type { Settings } from '@/lib/settings';
import { loadSettings, addWatchTime, getWatchTime, getBlockDismissed, setBlockDismissed, QUALITY_MAP } from '@/lib/settings';
import './style.css';

let currentSettings: Settings | null = null;

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',

  async main() {
    const settings = await loadSettings();
    currentSettings = settings;
    applySettings(settings);
    startObserver();
    setupPlaybackSpeed(settings);
    setupDefaultQuality(settings);
    setupWatchTimer(settings);
    setupDownloadThumbnailButton(settings);
    setupFullscreenDetection();

    browser.storage.onChanged.addListener((changes) => {
      if (changes.ytr_settings?.newValue) {
        const s = changes.ytr_settings.newValue as Settings;
        currentSettings = s;
        applySettings(s);
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
    // Auto-hide logo animation when custom logo is set, unless user explicitly disabled this
    d.ytrHideLogoAnimation = String(s.hideLogoAnimation !== false);
  } else {
    delete d.ytrCustomLogo;
    el.style.removeProperty('--ytr-custom-logo');
    el.style.removeProperty('--ytr-custom-logo-ratio');
    d.ytrHideLogoAnimation = String(s.hideLogoAnimation);
  }

  // Playables
  d.ytrHidePlayables = String(s.hidePlayables);
  d.ytrHideFilterBar = String(s.hideFilterBar);
  d.ytrDisableAvatarLive = String(s.disableAvatarLiveRedirect);

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

function tagFeedItems(): void {
  const items = document.querySelectorAll(FEED_ITEM_SELECTOR);
  if (items.length === 0) {
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

function setupDefaultQuality(s: Settings): void {
  if (s.defaultQuality === 'auto') return;

  const applyQuality = () => {
    const player = (document.querySelector('#movie_player') as any);
    if (!player?.getAvailableQualityLevels) return;

    const available: string[] = player.getAvailableQualityLevels();
    if (!available.length) return;

    const targetHeight = QUALITY_MAP[s.defaultQuality] || 0;
    if (!targetHeight) return;

    // YouTube quality labels: hd2160, hd1440, hd1080, hd720, large (480), medium (360), small (240), tiny (144)
    const qualityLabels: Record<number, string> = {
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

    // Find the best available quality <= target
    const sortedHeights = Object.keys(QUALITY_MAP)
      .map((k) => QUALITY_MAP[k])
      .sort((a, b) => b - a);

    let bestLabel = '';
    for (const h of sortedHeights) {
      if (h > targetHeight) continue;
      const label = qualityLabels[h];
      if (label && available.includes(label)) {
        bestLabel = label;
        break;
      }
    }

    if (bestLabel) {
      player.setPlaybackQualityRange(bestLabel, bestLabel);
    }
  };

  if (!qualitySetup) {
    qualitySetup = true;
    document.addEventListener('yt-navigate-finish', () => {
      setTimeout(applyQuality, 1500);
      setTimeout(applyQuality, 4000);
    });
  }

  setTimeout(applyQuality, 1500);
  setTimeout(applyQuality, 4000);
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

  blockOverlay = document.createElement('div');
  blockOverlay.id = 'ytr-block-overlay';
  blockOverlay.innerHTML = `
    <div class="ytr-block-content">
      <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <h2 class="ytr-block-title">${escapeHtml(currentSettings?.language === 'ru' ? 'Дневной лимит достигнут' : 'Daily limit reached')}</h2>
      <p class="ytr-block-message">${escapeHtml(
        (currentSettings?.language === 'ru'
          ? `Вы смотрите YouTube уже ${minutes} минут сегодня. Сделайте перерыв!`
          : `You've been watching YouTube for ${minutes} minutes today. Take a break!`
        )
      )}</p>
      <button class="ytr-block-close">${escapeHtml(currentSettings?.language === 'ru' ? 'Продолжить' : 'Continue anyway')}</button>
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

// --- Image overlay (shared by thumbnail preview + screenshot) ---

function showImageOverlay(imgSrc: string, filename: string): void {
  const existing = document.querySelector('#ytr-thumb-overlay');
  if (existing) existing.remove();

  const isRu = currentSettings?.language === 'ru';
  const overlay = document.createElement('div');
  overlay.id = 'ytr-thumb-overlay';

  const backdrop = document.createElement('div');
  backdrop.className = 'ytr-thumb-overlay-backdrop';

  const content = document.createElement('div');
  content.className = 'ytr-thumb-overlay-content';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'ytr-thumb-overlay-img-wrap';

  const img = document.createElement('img');
  img.src = imgSrc;
  img.alt = '';
  img.className = 'ytr-thumb-overlay-img';
  img.draggable = false;

  imgWrap.appendChild(img);

  // --- Zoom & Pan state ---
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startPanX = 0;
  let startPanY = 0;

  function applyTransform(animate = false) {
    if (animate) {
      img.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)';
    } else {
      img.style.transition = 'none';
    }
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    imgWrap.style.cursor = scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in';
  }

  function resetTransform() {
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform(true);
  }

  // Scroll to zoom
  imgWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const newScale = Math.max(0.5, Math.min(8, scale + delta * scale));
    // Zoom toward cursor position
    const rect = imgWrap.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const ratio = newScale / scale;
    panX = cx - ratio * (cx - panX);
    panY = cy - ratio * (cy - panY);
    scale = newScale;
    applyTransform(false);
  }, { passive: false });

  // Click to zoom in, double-click to reset
  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  imgWrap.addEventListener('click', (e) => {
    if (isDragging) return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      // Double click — reset
      resetTransform();
    } else {
      clickTimer = setTimeout(() => {
        clickTimer = null;
        if (scale < 1.5) {
          // Zoom to 2x toward click point
          const rect = imgWrap.getBoundingClientRect();
          const cx = e.clientX - rect.left - rect.width / 2;
          const cy = e.clientY - rect.top - rect.height / 2;
          const newScale = 2;
          const ratio = newScale / scale;
          panX = cx - ratio * (cx - panX);
          panY = cy - ratio * (cy - panY);
          scale = newScale;
          applyTransform(true);
        }
      }, 200);
    }
  });

  // Drag to pan
  imgWrap.addEventListener('mousedown', (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startPanX = panX;
    startPanY = panY;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartX;
      const dy = ev.clientY - dragStartY;
      if (!isDragging && Math.abs(dx) + Math.abs(dy) > 4) isDragging = true;
      panX = startPanX + dx;
      panY = startPanY + dy;
      applyTransform(false);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      imgWrap.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
      // Delay resetting isDragging so click handler can check it
      setTimeout(() => { isDragging = false; }, 10);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    imgWrap.style.cursor = 'grabbing';
  });

  // Touch: pinch zoom + pan
  let lastTouchDist = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;

  imgWrap.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.hypot(dx, dy);
    } else if (e.touches.length === 1 && scale > 1) {
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      startPanX = panX;
      startPanY = panY;
    }
  }, { passive: true });

  imgWrap.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastTouchDist > 0) {
        scale = Math.max(0.5, Math.min(8, scale * (dist / lastTouchDist)));
        applyTransform(false);
      }
      lastTouchDist = dist;
    } else if (e.touches.length === 1 && scale > 1) {
      panX = startPanX + (e.touches[0].clientX - lastTouchX);
      panY = startPanY + (e.touches[0].clientY - lastTouchY);
      applyTransform(false);
    }
  }, { passive: false });

  const actions = document.createElement('div');
  actions.className = 'ytr-thumb-overlay-actions';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'ytr-thumb-overlay-reset';
  resetBtn.title = isRu ? 'Сбросить' : 'Reset';
  resetBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.65 6.35A7.96 7.96 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;
  resetBtn.addEventListener('click', (e) => { e.stopPropagation(); resetTransform(); });

  const dlBtn = document.createElement('button');
  dlBtn.className = 'ytr-thumb-overlay-download';
  dlBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 18v2H7v-2h10zm0-8h-4V4H11v6H7l5 5 5-5z"/></svg><span>${isRu ? 'Скачать' : 'Download'}</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ytr-thumb-overlay-close';
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;

  actions.appendChild(resetBtn);
  actions.appendChild(dlBtn);
  actions.appendChild(closeBtn);
  content.appendChild(imgWrap);
  content.appendChild(actions);
  overlay.appendChild(backdrop);
  overlay.appendChild(content);

  const remove = () => { overlay.remove(); document.removeEventListener('keydown', handler); };
  function handler(e: KeyboardEvent) {
    if (e.key === 'Escape') remove();
    if (e.key === '0' || e.key === 'r') resetTransform();
    if (e.key === '+' || e.key === '=') {
      scale = Math.min(8, scale * 1.3);
      applyTransform(true);
    }
    if (e.key === '-') {
      scale = Math.max(0.5, scale / 1.3);
      applyTransform(true);
    }
  }

  backdrop.addEventListener('click', remove);
  closeBtn.addEventListener('click', remove);
  dlBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = imgSrc;
    a.download = filename;
    if (imgSrc.startsWith('data:') || imgSrc.startsWith('blob:')) {
      a.click();
    } else {
      a.target = '_blank';
      a.click();
    }
  });

  document.addEventListener('keydown', handler);
  document.body.appendChild(overlay);
  applyTransform(false);
}

// --- v0.4.0: Download Button (Thumbnail + Video) ---

let downloadBtnInjected = false;
let downloadNavListenerAdded = false;
let downloadMenuCloseHandler: (() => void) | null = null;

function closeAllYtrMenus(): void {
  const wasOpen = document.querySelector('.ytr-download-menu-open');
  document.querySelectorAll('.ytr-download-menu-open').forEach((m) => m.classList.remove('ytr-download-menu-open'));
  if (wasOpen) document.documentElement.style.removeProperty('overflow');
}

function openYtrMenu(menu: HTMLElement, wrapper: HTMLElement): void {
  closeAllYtrMenus();
  // Close YouTube's own popup menus
  document.querySelectorAll('tp-yt-iron-dropdown[style*="display"]').forEach((d) => {
    (d as HTMLElement).style.display = 'none';
  });

  // Position: below by default, above if not enough space
  menu.style.top = '';
  menu.style.bottom = '';
  menu.classList.add('ytr-download-menu-open');
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.bottom > window.innerHeight - 8) {
    menu.style.top = 'auto';
    menu.style.bottom = 'calc(100% + 4px)';
  }
  // Lock page scroll
  document.documentElement.style.overflow = 'hidden';
}

function setupDownloadThumbnailButton(s: Settings): void {
  if (!s.downloadThumbnailButton) {
    document.querySelectorAll('.ytr-download-btn').forEach((el) => el.remove());
    downloadBtnInjected = false;
    return;
  }

  const injectButton = () => {
    if (!currentSettings?.downloadThumbnailButton) return;

    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) {
      document.querySelectorAll('.ytr-download-btn').forEach((el) => el.remove());
      return;
    }

    if (document.querySelector('.ytr-download-btn')) return;

    // Insert next to the ··· (more) button — same flex container
    const moreBtn = document.querySelector('ytd-watch-metadata ytd-menu-renderer yt-button-shape.ytd-menu-renderer, ytd-watch-metadata ytd-menu-renderer #button-shape');
    const insertTarget = moreBtn?.parentElement || document.querySelector('ytd-watch-metadata #actions-inner, ytd-watch-metadata #actions, #top-level-buttons-computed');
    if (!insertTarget) return;

    const isRu = currentSettings?.language === 'ru';
    const wrapper = document.createElement('div');
    wrapper.className = 'ytr-download-btn';

    const btn = document.createElement('button');
    btn.className = 'ytr-action-btn';
    btn.title = isRu ? 'Скачать' : 'Download';
    btn.setAttribute('aria-label', isRu ? 'Скачать' : 'Download');
    btn.innerHTML = `<svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor"><path d="M469-327q-5-2-10-7L308-485q-9-9.27-8.5-21.64.5-12.36 9.11-21.36 9.39-9 21.89-9t21.5 9l98 99v-341q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v341l99-99q8.8-9 20.9-8.5 12.1.5 21.49 9.5 8.61 9 8.61 21.5t-9 21.5L501-334q-5 5-10.13 7-5.14 2-11 2-5.87 0-10.87-2ZM220-160q-24 0-42-18t-18-42v-113q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v113h520v-113q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v113q0 24-18 42t-42 18H220Z"/></svg>`;

    const menu = document.createElement('div');
    menu.className = 'ytr-download-menu';

    // --- Thumbnail carousel ---
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
    const loadedThumbs: { url: string; label: string; el: HTMLImageElement }[] = [];
    let carouselIdx = 0;

    for (const variant of thumbVariants) {
      const img = document.createElement('img');
      img.src = variant.url; // NO lazy loading — must load in hidden menu
      img.alt = variant.label;
      img.className = 'ytr-carousel-img';
      img.addEventListener('click', (ev) => {
        ev.stopPropagation();
        showImageOverlay(variant.url, `thumbnail-${videoId}-${variant.label.toLowerCase()}.jpg`);
      });
      const removeInvalid = () => {
        img.remove();
        const idx = loadedThumbs.findIndex((t) => t.el === img);
        if (idx >= 0) loadedThumbs.splice(idx, 1);
        refreshCarousel();
      };
      img.addEventListener('error', removeInvalid);
      img.addEventListener('load', () => {
        if (img.naturalWidth <= 120) removeInvalid(); // YouTube placeholder
        else refreshCarousel();
      });
      track.appendChild(img);
      loadedThumbs.push({ url: variant.url, label: variant.label, el: img });
    }

    // Arrow buttons — OUTSIDE the viewport overflow, inside carouselOuter
    const prevArrow = document.createElement('button');
    prevArrow.className = 'ytr-carousel-arrow ytr-carousel-prev';
    prevArrow.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;
    prevArrow.addEventListener('click', (e) => { e.stopPropagation(); goSlide(-1); });

    const nextArrow = document.createElement('button');
    nextArrow.className = 'ytr-carousel-arrow ytr-carousel-next';
    nextArrow.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
    nextArrow.addEventListener('click', (e) => { e.stopPropagation(); goSlide(1); });

    const dotsRow = document.createElement('div');
    dotsRow.className = 'ytr-carousel-dots';

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

    setTimeout(refreshCarousel, 50);
    setTimeout(refreshCarousel, 1500);

    // --- Menu items ---
    const thumbItem = document.createElement('button');
    thumbItem.className = 'ytr-download-menu-item';
    thumbItem.innerHTML = `<svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor"><path d="M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm86-157h429q9 0 13-8t-1-16L590-457q-5-6-12-6t-12 6L446-302l-81-111q-5-6-12-6t-12 6l-86 112q-6 8-2 16t13 8Z"/></svg><span>${isRu ? 'Скачать превью' : 'Download thumbnail'}</span>`;
    thumbItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllYtrMenus();
      const cur = loadedThumbs[carouselIdx];
      if (cur) {
        const a = document.createElement('a');
        a.href = cur.url;
        a.download = `thumbnail-${videoId}${cur.label === 'Main' ? '' : '-' + cur.label.toLowerCase()}.jpg`;
        a.target = '_blank';
        a.click();
      }
    });

    const videoItem = document.createElement('button');
    videoItem.className = 'ytr-download-menu-item';
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
        openYtrMenu(menu, wrapper);
        refreshCarousel(); // ensure arrows are correct when menu becomes visible
      }
    });

    if (!downloadMenuCloseHandler) {
      downloadMenuCloseHandler = () => closeAllYtrMenus();
      document.addEventListener('click', downloadMenuCloseHandler);
    }

    wrapper.appendChild(btn);
    wrapper.appendChild(menu);
    // Insert after the ··· (more) button
    if (moreBtn && moreBtn.nextSibling) {
      moreBtn.parentElement!.insertBefore(wrapper, moreBtn.nextSibling);
    } else if (moreBtn) {
      moreBtn.parentElement!.appendChild(wrapper);
    } else {
      insertTarget.appendChild(wrapper);
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
