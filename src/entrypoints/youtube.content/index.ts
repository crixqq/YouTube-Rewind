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
      }
    });
  },
});

function applySettings(s: Settings): void {
  const el = document.documentElement;

  el.dataset.ytrNoAdaptiveDesc = String(s.adaptiveColorsDescription);

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

  el.dataset.ytrAvatarShape = s.avatarShape;
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

// --- MutationObserver ---

let debounceTimer: ReturnType<typeof setTimeout>;

function startObserver(): void {
  const observer = new MutationObserver((mutations) => {
    let needsExploreCheck = false;

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
        }
      }
    }

    if (needsExploreCheck) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(tagExploreSections, 50);
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
}
