<script lang="ts">
  import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/lib/settings';
  import { t, setLocale } from '@/lib/i18n';
  import SettingsSection from '@/components/SettingsSection.svelte';
  import Toggle from '@/components/Toggle.svelte';
  import Slider from '@/components/Slider.svelte';
  import ShapePicker from '@/components/ShapePicker.svelte';
  import FilterGroup from '@/components/FilterGroup.svelte';

  let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  let loaded = $state(false);
  let langVersion = $state(0);
  let langMenuOpen = $state(false);

  // Update checker
  type UpdateState = 'idle' | 'checking' | 'available' | 'up-to-date' | 'error';
  let updateState = $state<UpdateState>('idle');
  let latestVersion = $state('');
  let releaseUrl = $state('');
  let updateMenuOpen = $state(false);

  const CACHE_KEY = 'ytr_update_cache';
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour

  function isNewer(remote: string, local: string): boolean {
    const r = remote.replace(/^v/, '').split('.').map(Number);
    const l = local.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(r.length, l.length); i++) {
      const rv = r[i] || 0;
      const lv = l[i] || 0;
      if (rv > lv) return true;
      if (rv < lv) return false;
    }
    return false;
  }

  async function checkForUpdates() {
    const currentVersion = browser.runtime.getManifest().version;

    // Check cache first
    try {
      const cached = await browser.storage.local.get(CACHE_KEY);
      const cache = cached[CACHE_KEY];
      if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
        latestVersion = cache.version;
        releaseUrl = cache.url;
        updateState = isNewer(cache.version, currentVersion) ? 'available' : 'up-to-date';
        return;
      }
    } catch {}

    updateState = 'checking';

    try {
      const res = await fetch('https://api.github.com/repos/crixqq/YouTube-Rewind/releases/latest');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const ver = (data.tag_name || '').replace(/^v/, '');
      const url = data.html_url || 'https://github.com/crixqq/YouTube-Rewind/releases';

      latestVersion = ver;
      releaseUrl = url;
      updateState = isNewer(ver, currentVersion) ? 'available' : 'up-to-date';

      // Cache result
      await browser.storage.local.set({
        [CACHE_KEY]: { version: ver, url, timestamp: Date.now() },
      });
    } catch {
      updateState = 'error';
    }
  }

  function toggleUpdateMenu() {
    updateMenuOpen = !updateMenuOpen;
    if (updateMenuOpen && updateState === 'idle') {
      checkForUpdates();
    }
  }

  const LANGUAGES = [
    { id: 'auto', label: 'Auto' },
    { id: 'en', label: 'English' },
    { id: 'ru', label: 'Русский' },
    { id: 'uk', label: 'Українська' },
    { id: 'es', label: 'Español' },
    { id: 'pt', label: 'Português' },
    { id: 'fr', label: 'Français' },
    { id: 'de', label: 'Deutsch' },
    { id: 'tr', label: 'Türkçe' },
    { id: 'ja', label: '日本語' },
    { id: 'ko', label: '한국어' },
    { id: 'zh', label: '中文' },
  ] as const;

  $effect(() => {
    loadSettings().then((s) => {
      settings = s;
      setLocale(s.language);
      loaded = true;
      langVersion++;
      checkForUpdates();
    });
  });

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    settings[key] = value;
    saveSettings({ [key]: value });
  }

  function selectLanguage(lang: string) {
    settings.language = lang;
    saveSettings({ language: lang });
    setLocale(lang);
    langMenuOpen = false;
    langVersion++;
  }

  function toggleLangMenu() {
    langMenuOpen = !langMenuOpen;
  }

  function closeMenus(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.lang-wrapper')) {
      langMenuOpen = false;
    }
    if (!target.closest('.version-wrapper')) {
      updateMenuOpen = false;
    }
  }

  let currentLangDisplay = $derived(
    LANGUAGES.find((l) => l.id === settings.language)?.label ?? 'Auto'
  );

  let homepageFilters = $derived.by(() => {
    void langVersion;
    return [
      { key: 'hideShorts', label: t('settingHideShorts'), checked: settings.hideShorts, onchange: (v: boolean) => update('hideShorts', v) },
      { key: 'hidePosts', label: t('settingHidePosts'), checked: settings.hidePosts, onchange: (v: boolean) => update('hidePosts', v) },
      { key: 'hideMixes', label: t('settingHideMixes'), checked: settings.hideMixes, onchange: (v: boolean) => update('hideMixes', v) },
      { key: 'hideBreakingNews', label: t('settingHideBreakingNews'), checked: settings.hideBreakingNews, onchange: (v: boolean) => update('hideBreakingNews', v) },
      { key: 'hideLatestPosts', label: t('settingHideLatestPosts'), checked: settings.hideLatestPosts, onchange: (v: boolean) => update('hideLatestPosts', v) },
      { key: 'hideExploreTopics', label: t('settingHideExploreTopics'), checked: settings.hideExploreTopics, onchange: (v: boolean) => update('hideExploreTopics', v) },
    ];
  });

  let searchFilters = $derived.by(() => {
    void langVersion;
    return [
      { key: 'hideSearchShorts', label: t('settingHideSearchShorts'), checked: settings.hideSearchShorts, onchange: (v: boolean) => update('hideSearchShorts', v) },
      { key: 'hideSearchChannels', label: t('settingHideSearchChannels'), checked: settings.hideSearchChannels, onchange: (v: boolean) => update('hideSearchChannels', v) },
      { key: 'hideSearchPeopleWatched', label: t('settingHideSearchPeopleWatched'), checked: settings.hideSearchPeopleWatched, onchange: (v: boolean) => update('hideSearchPeopleWatched', v) },
    ];
  });

  let topbarFilters = $derived.by(() => {
    void langVersion;
    return [
      { key: 'hideTopbarCreate', label: t('settingHideTopbarCreate'), checked: settings.hideTopbarCreate, onchange: (v: boolean) => update('hideTopbarCreate', v) },
      { key: 'hideTopbarVoiceSearch', label: t('settingHideTopbarVoiceSearch'), checked: settings.hideTopbarVoiceSearch, onchange: (v: boolean) => update('hideTopbarVoiceSearch', v) },
      { key: 'hideTopbarNotifications', label: t('settingHideTopbarNotifications'), checked: settings.hideTopbarNotifications, onchange: (v: boolean) => update('hideTopbarNotifications', v) },
      { key: 'hideTopbarSearch', label: t('settingHideTopbarSearch'), checked: settings.hideTopbarSearch, onchange: (v: boolean) => update('hideTopbarSearch', v) },
      { key: 'hideCountryCode', label: t('settingHideCountryCode'), checked: settings.hideCountryCode, onchange: (v: boolean) => update('hideCountryCode', v) },
    ];
  });

  const THUMBNAIL_EFFECTS = [
    { id: 'none', label: 'thumbnailDefault' },
    { id: 'pixelate', label: 'thumbnailPixelate' },
    { id: 'blur', label: 'thumbnailBlur' },
    { id: 'grayscale', label: 'thumbnailGrayscale' },
    { id: 'hidden', label: 'thumbnailHidden' },
  ];

  let sidebarFilters = $derived.by(() => {
    void langVersion;
    return [
      { key: 'hideSidebarSubscriptions', label: t('settingHideSidebarSubscriptions'), checked: settings.hideSidebarSubscriptions, onchange: (v: boolean) => update('hideSidebarSubscriptions', v) },
      { key: 'hideSidebarYou', label: t('settingHideSidebarYou'), checked: settings.hideSidebarYou, onchange: (v: boolean) => update('hideSidebarYou', v) },
      { key: 'hideSidebarExplore', label: t('settingHideSidebarExplore'), checked: settings.hideSidebarExplore, onchange: (v: boolean) => update('hideSidebarExplore', v) },
      { key: 'hideSidebarMoreFromYT', label: t('settingHideSidebarMoreFromYT'), checked: settings.hideSidebarMoreFromYT, onchange: (v: boolean) => update('hideSidebarMoreFromYT', v) },
      { key: 'hideSidebarReportHistory', label: t('settingHideSidebarReportHistory'), checked: settings.hideSidebarReportHistory, onchange: (v: boolean) => update('hideSidebarReportHistory', v) },
      { key: 'hideSidebarFooter', label: t('settingHideSidebarFooter'), checked: settings.hideSidebarFooter, onchange: (v: boolean) => update('hideSidebarFooter', v) },
    ];
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
{#if loaded}
  <div onclick={closeMenus} role="presentation">
    {#key langVersion}
      <header class="app-header">
        <div class="header-content">
          <h1 class="app-title">YouTube Rewind</h1>
          <div class="header-actions">
            <div class="lang-wrapper">
              <!-- svelte-ignore a11y_consider_explicit_label -->
              <button class="lang-button" onclick={toggleLangMenu} aria-haspopup="true" aria-expanded={langMenuOpen} title="Language">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </button>

              {#if langMenuOpen}
                <div class="lang-menu" role="menu">
                  {#each LANGUAGES as lang (lang.id)}
                    <button
                      class="lang-menu-item"
                      class:active={settings.language === lang.id}
                      role="menuitem"
                      onclick={() => selectLanguage(lang.id)}
                    >
                      {lang.label}
                      {#if settings.language === lang.id}
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            <div class="version-wrapper">
              <button class="version-button" onclick={toggleUpdateMenu} aria-haspopup="true" aria-expanded={updateMenuOpen}>
                v{browser.runtime.getManifest().version}
                {#if updateState === 'available'}
                  <span class="update-dot"></span>
                {/if}
              </button>

              {#if updateMenuOpen}
                <div class="update-menu" role="menu">
                  {#if updateState === 'checking'}
                    <div class="update-status">
                      <svg class="update-spinner" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <path d="M21 12a9 9 0 1 1-6.22-8.56"/>
                      </svg>
                      <span>{t('updateChecking')}</span>
                    </div>
                  {:else if updateState === 'available'}
                    <div class="update-status update-status-available">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <span>{t('updateAvailable')}: <b>v{latestVersion}</b></span>
                    </div>
                    <a class="update-download" href={releaseUrl} target="_blank" rel="noopener" role="menuitem">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      {t('updateDownload')}
                    </a>
                  {:else if updateState === 'up-to-date'}
                    <div class="update-status update-status-ok">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span>{t('updateUpToDate')}</span>
                    </div>
                  {:else if updateState === 'error'}
                    <div class="update-status update-status-error">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                      <span>{t('updateError')}</span>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        </div>
      </header>

      <main class="app-body">
        <SettingsSection title={t('sectionTopBar')}>
          <FilterGroup filters={topbarFilters} />
        </SettingsSection>

        <SettingsSection title={t('sectionWatchPage')}>
          <Toggle label={t('settingClassicPlayer')} checked={settings.classicPlayer} onchange={(v) => update('classicPlayer', v)} />
          <Toggle label={t('settingAdaptiveDescription')} checked={settings.adaptiveColorsDescription} onchange={(v) => update('adaptiveColorsDescription', v)} />
          <Toggle label={t('settingWidePlayer')} checked={settings.widePlayer} onchange={(v) => update('widePlayer', v)} />
        </SettingsSection>

        <SettingsSection title={t('sectionHomepageLayout')}>
          <Slider
            label={t('settingVideosPerRow')}
            value={settings.videosPerRow}
            min={0}
            max={8}
            defaultLabel={t('settingVideosPerRowDefault')}
            onchange={(v) => update('videosPerRow', v)}
          />
        </SettingsSection>

        <SettingsSection title={t('sectionHomepageFilter')}>
          <FilterGroup filters={homepageFilters} />
        </SettingsSection>

        <SettingsSection title={t('sectionSearchFilter')}>
          <FilterGroup filters={searchFilters} />
        </SettingsSection>

        <SettingsSection title={t('sectionSidebarFilter')}>
          <FilterGroup filters={sidebarFilters} />
        </SettingsSection>

        <SettingsSection title={t('sectionAvatarShape')}>
          <ShapePicker variant="avatar" value={settings.avatarShape} onchange={(v) => update('avatarShape', v)} />
        </SettingsSection>

        <SettingsSection title={t('sectionThumbnailEffect')}>
          <div class="effect-picker">
            {#each THUMBNAIL_EFFECTS as effect (effect.id)}
              <button
                class="effect-option"
                class:active={settings.thumbnailEffect === effect.id}
                onclick={() => update('thumbnailEffect', effect.id)}
              >
                {t(effect.label)}
              </button>
            {/each}
          </div>
          {#if settings.thumbnailEffect !== 'none'}
            <Toggle label={t('thumbnailHoverReveal')} checked={settings.thumbnailHoverReveal} onchange={(v) => update('thumbnailHoverReveal', v)} />
          {/if}
          <Toggle label={t('settingDisableHoverAnimation')} checked={settings.disableHoverAnimation} onchange={(v) => update('disableHoverAnimation', v)} />
        </SettingsSection>
      </main>

      <footer class="app-footer">
        <span class="footer-text">
          <a href="https://github.com/crixqq/YouTube-Rewind" target="_blank" rel="noopener">YouTube Rewind</a>
          by
          <a href="https://github.com/crixqq" target="_blank" rel="noopener">crixqq</a>
        </span>
        <a class="footer-link" href="https://github.com/crixqq/YouTube-Rewind/blob/main/LICENSE" target="_blank" rel="noopener">GPL-3.0</a>
      </footer>
    {/key}
  </div>
{/if}

<style>
  :root {
    /* Material Design 3 tokens — Light */
    --md-primary: #5b5091;
    --md-on-primary: #ffffff;
    --md-primary-container: #e5deff;
    --md-on-primary-container: #170065;
    --md-secondary: #5e5c71;
    --md-on-secondary: #ffffff;
    --md-secondary-container: #e4dff9;
    --md-on-secondary-container: #1b1a2c;
    --md-surface: #fdf8ff;
    --md-surface-dim: #ddd8e0;
    --md-surface-container-lowest: #ffffff;
    --md-surface-container-low: #f7f2fa;
    --md-surface-container: #f1ecf4;
    --md-surface-container-high: #ece7ef;
    --md-surface-container-highest: #e6e1e9;
    --md-on-surface: #1c1b20;
    --md-on-surface-variant: #48454e;
    --md-outline: #79767f;
    --md-outline-variant: #c9c5d0;
    --md-error: #ba1a1a;

    /* Shape */
    --md-shape-xs: 4px;
    --md-shape-sm: 8px;
    --md-shape-md: 12px;
    --md-shape-lg: 16px;
    --md-shape-xl: 28px;
    --md-shape-full: 9999px;

    /* Motion */
    --md-easing-standard: cubic-bezier(0.2, 0, 0, 1);
    --md-easing-emphasized: cubic-bezier(0.2, 0, 0, 1);
    --md-duration-short: 0.2s;
    --md-duration-medium: 0.4s;

    font-family: 'Google Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.43;
    -webkit-font-smoothing: antialiased;
  }

  /* Material Design 3 tokens — Dark */
  @media (prefers-color-scheme: dark) {
    :root {
      --md-primary: #c8bfff;
      --md-on-primary: #2c2060;
      --md-primary-container: #433978;
      --md-on-primary-container: #e5deff;
      --md-secondary: #c8c3dc;
      --md-on-secondary: #302e41;
      --md-secondary-container: #474459;
      --md-on-secondary-container: #e4dff9;
      --md-surface: #141318;
      --md-surface-dim: #141318;
      --md-surface-container-lowest: #0f0d13;
      --md-surface-container-low: #1c1b20;
      --md-surface-container: #201f25;
      --md-surface-container-high: #2b292f;
      --md-surface-container-highest: #36343a;
      --md-on-surface: #e6e1e9;
      --md-on-surface-variant: #c9c5d0;
      --md-outline: #938f99;
      --md-outline-variant: #48454e;
      --md-error: #ffb4ab;
    }
  }

  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    width: 400px;
    max-height: 520px;
    overflow-y: auto;
    background: var(--md-surface);
    color: var(--md-on-surface);
  }

  :global(#app) {
    display: flex;
    flex-direction: column;
  }

  :global(body::-webkit-scrollbar) {
    width: 4px;
  }

  :global(body::-webkit-scrollbar-thumb) {
    background: var(--md-outline-variant);
    border-radius: var(--md-shape-full);
  }

  :global(body::-webkit-scrollbar-track) {
    background: transparent;
  }

  .app-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--md-surface);
    border-bottom: 1px solid var(--md-outline-variant);
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
  }

  .app-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--md-on-surface);
    letter-spacing: -0.2px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .lang-wrapper {
    position: relative;
  }

  .lang-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: var(--md-shape-full);
    background: transparent;
    color: var(--md-on-surface-variant);
    cursor: pointer;
    transition: background var(--md-duration-short) var(--md-easing-standard);
  }

  .lang-button:hover {
    background: var(--md-surface-container-high);
  }

  .lang-button:active {
    background: var(--md-surface-container-highest);
  }

  /* M3 Expressive Menu: Medium shape (12dp), elevation level 2 */
  .lang-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 140px;
    max-height: 360px;
    background: var(--md-surface-container);
    border-radius: var(--md-shape-md);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15);
    padding: 4px 0;
    z-index: 20;
    overflow-y: auto;
    overscroll-behavior: contain;
    animation: menuFadeIn 0.12s var(--md-easing-emphasized);
    transform-origin: top right;
  }

  .lang-menu::-webkit-scrollbar {
    width: 3px;
  }

  .lang-menu::-webkit-scrollbar-thumb {
    background: var(--md-outline-variant);
    border-radius: var(--md-shape-full);
  }

  .lang-menu::-webkit-scrollbar-track {
    background: transparent;
  }

  @keyframes menuFadeIn {
    from {
      opacity: 0;
      transform: scaleY(0.8);
    }
    to {
      opacity: 1;
      transform: scaleY(1);
    }
  }

  /* M3 Menu item: 48dp height, 12dp horizontal padding */
  .lang-menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 48px;
    padding: 0 12px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--md-on-surface);
    font-size: 14px;
    font-family: inherit;
    cursor: pointer;
    transition: background var(--md-duration-short) var(--md-easing-standard);
    text-align: left;
  }

  .lang-menu-item:hover {
    background: var(--md-surface-container-high);
  }

  .lang-menu-item.active {
    color: var(--md-primary);
    font-weight: 500;
  }

  .version-wrapper {
    position: relative;
  }

  .version-button {
    position: relative;
    font-size: 11px;
    color: var(--md-on-surface-variant);
    background: var(--md-surface-container);
    padding: 2px 8px;
    border: none;
    border-radius: var(--md-shape-full);
    font-family: monospace;
    cursor: pointer;
    transition: background var(--md-duration-short) var(--md-easing-standard);
  }

  .version-button:hover {
    background: var(--md-surface-container-high);
  }

  .version-button:active {
    background: var(--md-surface-container-highest);
  }

  .update-dot {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 8px;
    height: 8px;
    background: var(--md-error);
    border-radius: 50%;
    border: 1.5px solid var(--md-surface);
  }

  .update-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 200px;
    background: var(--md-surface-container);
    border-radius: var(--md-shape-md);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15);
    padding: 4px 0;
    z-index: 20;
    animation: menuFadeIn 0.12s var(--md-easing-emphasized);
    transform-origin: top right;
  }

  .update-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--md-on-surface-variant);
  }

  .update-status-available {
    color: var(--md-primary);
  }

  .update-status-ok {
    color: var(--md-on-surface-variant);
  }

  .update-status-error {
    color: var(--md-error);
  }

  .update-spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .update-download {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 8px 4px;
    padding: 8px 12px;
    border-radius: var(--md-shape-sm);
    background: var(--md-primary);
    color: var(--md-on-primary);
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: opacity var(--md-duration-short) var(--md-easing-standard);
    justify-content: center;
  }

  .update-download:hover {
    opacity: 0.9;
    text-decoration: none;
  }

  /* Logo upload row */
  /* Thumbnail effect picker */
  .effect-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 16px 12px;
  }

  .effect-option {
    font-size: 12px;
    font-family: inherit;
    padding: 6px 14px;
    border: 1px solid var(--md-outline-variant);
    border-radius: var(--md-shape-full);
    background: transparent;
    color: var(--md-on-surface-variant);
    cursor: pointer;
    transition: all var(--md-duration-short) var(--md-easing-standard);
  }

  .effect-option:hover {
    background: var(--md-surface-container-high);
  }

  .effect-option.active {
    background: var(--md-primary);
    color: var(--md-on-primary);
    border-color: var(--md-primary);
  }

  .app-body {
    padding-bottom: 8px;
  }

  .app-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px 16px 24px;
    font-size: 13px;
    color: var(--md-on-surface-variant);
  }

  .app-footer a {
    color: var(--md-primary);
    text-decoration: none;
  }

  .app-footer a:hover {
    text-decoration: underline;
  }

  .footer-link {
    opacity: 0.7;
  }

  .footer-text {
    opacity: 0.7;
  }
</style>
