import type { Settings } from '@/lib/settings';
import { loadSettings } from '@/lib/settings';
import './style.css';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',

  async main() {
    const settings = await loadSettings();
    applySettings(settings);
    startObserver();

    browser.storage.onChanged.addListener((changes) => {
      if (changes.ytr_settings?.newValue) {
        applySettings(changes.ytr_settings.newValue);
        tagExploreSections();
        tagSidebarSections();
        tagActionButtons();
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
  } else {
    delete d.ytrCustomLogo;
    el.style.removeProperty('--ytr-custom-logo');
    el.style.removeProperty('--ytr-custom-logo-ratio');
  }
}

// --- Explore More Topics: tag sections by title text ---

const EXPLORE_KEYWORDS = [
  'explore more topics',
  'другие темы',
  'ещё больше тем',
  'обзор тем',
  'больше тем',
];

function tagExploreSections(): void {
  document.querySelectorAll('ytd-rich-section-renderer:not([data-ytr-explore-topics])').forEach((section) => {
    const text = (section.textContent || '').toLowerCase();
    if (EXPLORE_KEYWORDS.some((kw) => text.includes(kw))) {
      section.setAttribute('data-ytr-explore-topics', 'true');
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

// --- MutationObserver ---

const TAGS_NEEDING_EXPLORE = new Set(['YTD-RICH-SECTION-RENDERER']);
const TAGS_NEEDING_SIDEBAR = new Set(['YTD-GUIDE-SECTION-RENDERER', 'YTD-GUIDE-RENDERER']);
const TAGS_NEEDING_ACTION = new Set(['YT-BUTTON-VIEW-MODEL', 'YTD-BUTTON-RENDERER', 'YTD-DOWNLOAD-BUTTON-RENDERER']);

let pendingFlags = 0; // bitmask: 1=explore, 2=sidebar, 4=action
let rafId = 0;

function flushPending(): void {
  rafId = 0;
  const flags = pendingFlags;
  pendingFlags = 0;
  if (flags & 1) tagExploreSections();
  if (flags & 2) tagSidebarSections();
  if (flags & 4) tagActionButtons();
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

        if (!(flags & 1) && (TAGS_NEEDING_EXPLORE.has(tag) ||
            (tag === 'YTD-BROWSE' && node.querySelector('ytd-rich-section-renderer') !== null))) {
          flags |= 1;
        }
        if (!(flags & 2) && TAGS_NEEDING_SIDEBAR.has(tag)) {
          flags |= 2;
        }
        if (!(flags & 4) && (TAGS_NEEDING_ACTION.has(tag) || node.id === 'top-level-buttons-computed')) {
          flags |= 4;
        }

        if (flags === 7) break;
      }
      if (flags === 7) break;
    }

    if (flags) scheduleScan(flags);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial scan after YouTube renders content
  setTimeout(() => scheduleScan(7), 800);
}
