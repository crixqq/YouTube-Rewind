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
    injectPixelFilter();
    startObserver();

    browser.storage.onChanged.addListener((changes) => {
      if (changes.ytr_settings?.newValue) {
        applySettings(changes.ytr_settings.newValue);
        tagExploreSections();
        tagSidebarSections();
      }
    });
  },
});

function applySettings(s: Settings): void {
  const el = document.documentElement;

  el.dataset.ytrNoAdaptiveDesc = String(s.adaptiveColorsDescription);

  // Top bar
  el.dataset.ytrHideTopbarCreate = String(s.hideTopbarCreate);
  el.dataset.ytrHideTopbarVoiceSearch = String(s.hideTopbarVoiceSearch);
  el.dataset.ytrHideTopbarNotifications = String(s.hideTopbarNotifications);
  el.dataset.ytrHideCountryCode = String(s.hideCountryCode);
  el.dataset.ytrHideTopbarSearch = String(s.hideTopbarSearch);

  // Thumbnail effect
  el.dataset.ytrThumbnailEffect = s.thumbnailEffect || 'none';
  el.dataset.ytrThumbnailNoReveal = String(!s.thumbnailHoverReveal);

  if (s.videosPerRow > 0) {
    el.dataset.ytrVideosPerRow = String(s.videosPerRow);
    el.style.setProperty('--ytr-videos-per-row', String(s.videosPerRow));
  } else {
    delete el.dataset.ytrVideosPerRow;
    el.style.removeProperty('--ytr-videos-per-row');
  }

  el.dataset.ytrHideShorts = String(s.hideShorts);
  el.dataset.ytrHidePosts = String(s.hidePosts);
  el.dataset.ytrHideMixes = String(s.hideMixes);
  el.dataset.ytrHideBreakingNews = String(s.hideBreakingNews);
  el.dataset.ytrHideLatestPosts = String(s.hideLatestPosts);
  el.dataset.ytrHideExploreTopics = String(s.hideExploreTopics);

  el.dataset.ytrHideSearchShorts = String(s.hideSearchShorts);
  el.dataset.ytrHideSearchChannels = String(s.hideSearchChannels);
  el.dataset.ytrHideSearchPeopleWatched = String(s.hideSearchPeopleWatched);

  el.dataset.ytrHideSidebarSubscriptions = String(s.hideSidebarSubscriptions);
  el.dataset.ytrHideSidebarYou = String(s.hideSidebarYou);
  el.dataset.ytrHideSidebarExplore = String(s.hideSidebarExplore);
  el.dataset.ytrHideSidebarMoreFromYt = String(s.hideSidebarMoreFromYT);
  el.dataset.ytrHideSidebarReportHistory = String(s.hideSidebarReportHistory);
  el.dataset.ytrHideSidebarFooter = String(s.hideSidebarFooter);

  el.dataset.ytrAvatarShape = s.avatarShape;
  el.dataset.ytrDisableHoverAnimation = String(s.disableHoverAnimation);
  el.dataset.ytrClassicPlayer = String(s.classicPlayer);
  el.dataset.ytrWidePlayer = String(s.widePlayer);
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
  document.querySelectorAll('ytd-rich-section-renderer').forEach((section) => {
    const text = (section.textContent || '').toLowerCase();
    const isExplore = EXPLORE_KEYWORDS.some((kw) => text.includes(kw));
    if (isExplore) {
      section.setAttribute('data-ytr-explore-topics', 'true');
    }
  });
}

// --- Sidebar: tag sections by content ---

function tagSidebarSections(): void {
  document.querySelectorAll('ytd-guide-section-renderer').forEach((section) => {
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

let debounceTimer: ReturnType<typeof setTimeout>;
let sidebarDebounceTimer: ReturnType<typeof setTimeout>;
function startObserver(): void {
  const observer = new MutationObserver((mutations) => {
    let needsExploreCheck = false;
    let needsSidebarCheck = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (
            node.tagName === 'YTD-RICH-SECTION-RENDERER' ||
            node.querySelector?.('ytd-rich-section-renderer')
          ) {
            needsExploreCheck = true;
          }

          if (
            node.tagName === 'YTD-GUIDE-SECTION-RENDERER' ||
            node.tagName === 'YTD-GUIDE-RENDERER' ||
            node.querySelector?.('ytd-guide-section-renderer')
          ) {
            needsSidebarCheck = true;
          }
        }
      }
    }

    if (needsExploreCheck) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(tagExploreSections, 50);
    }

    if (needsSidebarCheck) {
      clearTimeout(sidebarDebounceTimer);
      sidebarDebounceTimer = setTimeout(tagSidebarSections, 50);
    }

  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial scan after YouTube renders content
  setTimeout(tagExploreSections, 500);
  setTimeout(tagExploreSections, 2000);
  setTimeout(tagExploreSections, 5000);
  setTimeout(tagSidebarSections, 500);
  setTimeout(tagSidebarSections, 2000);
}
