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

  // Export/Import
  type DataFeedback = '' | 'copied' | 'imported' | 'error';
  let dataFeedback = $state<DataFeedback>('');
  let feedbackTimeout: ReturnType<typeof setTimeout>;

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

  // Init once on mount — no reactive deps, so $effect runs only once
  $effect(() => {
    loadSettings().then((s) => {
      settings = s;
      setLocale(s.language);
      langVersion++;
      loaded = true;
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

  function openLogoPage() {
    browser.tabs.create({ url: browser.runtime.getURL('logo.html') });
  }

  function removeLogo() {
    settings.customLogo = '';
    settings.customLogoRatio = 0;
    saveSettings({ customLogo: '', customLogoRatio: 0 });
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

  function showFeedback(type: DataFeedback) {
    dataFeedback = type;
    clearTimeout(feedbackTimeout);
    feedbackTimeout = setTimeout(() => { dataFeedback = ''; }, 2000);
  }

  function exportFile(format: 'json' | 'txt') {
    const { language: _, ...exportData } = settings;
    let content: string;
    let mime: string;
    let ext: string;
    if (format === 'json') {
      content = JSON.stringify(exportData, null, 2);
      mime = 'application/json';
      ext = 'json';
    } else {
      content = Object.entries(exportData).map(([k, v]) => `${k} = ${v}`).join('\n');
      mime = 'text/plain';
      ext = 'txt';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtube-rewind-settings.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard() {
    try {
      const { language: _, ...exportData } = settings;
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
      showFeedback('copied');
    } catch {
      showFeedback('error');
    }
  }

  function parseSettings(text: string): Partial<Settings> | null {
    // Try JSON
    try {
      const obj = JSON.parse(text);
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) return obj;
    } catch {}
    // Try key=value TXT format
    try {
      const lines = text.split('\n').filter((l) => l.includes('='));
      if (lines.length === 0) return null;
      const result: Record<string, unknown> = {};
      for (const line of lines) {
        const [key, ...rest] = line.split('=');
        const k = key.trim();
        const v = rest.join('=').trim();
        if (v === 'true') result[k] = true;
        else if (v === 'false') result[k] = false;
        else if (!isNaN(Number(v)) && v !== '') result[k] = Number(v);
        else result[k] = v;
      }
      return result as Partial<Settings>;
    } catch {}
    return null;
  }

  async function applyImport(data: Partial<Settings>) {
    // Only apply known keys
    const known = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
    const filtered: Partial<Settings> = {};
    for (const key of known) {
      if (key in data) (filtered as any)[key] = (data as any)[key];
    }
    settings = { ...settings, ...filtered };
    await saveSettings(filtered);
    showFeedback('imported');
  }

  function openImportPage() {
    browser.tabs.create({ url: browser.runtime.getURL('import.html') });
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseSettings(text);
      if (parsed) await applyImport(parsed);
      else showFeedback('error');
    } catch {
      showFeedback('error');
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
      { key: 'hideNewBadge', label: t('settingHideNewBadge'), checked: settings.hideNewBadge, onchange: (v: boolean) => update('hideNewBadge', v) },
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

  const THUMBNAIL_SHAPES = [
    { id: 'none', label: 'thumbShapeDefault' },
    { id: 'sharp', label: 'thumbShapeSharp' },
    { id: 'rounded', label: 'thumbShapeRounded' },
    { id: 'scallop', label: 'thumbShapeScallop' },
    { id: 'notched', label: 'thumbShapeNotched' },
    { id: 'slanted', label: 'thumbShapeSlanted' },
    { id: 'arch', label: 'thumbShapeArch' },
    { id: 'fan', label: 'thumbShapeFan' },
  ];

  const BANNER_STYLES = [
    { id: 'none', label: 'bannerDefault' },
    { id: 'sharp', label: 'bannerSharp' },
  ];

  let videoButtonFilters = $derived.by(() => {
    void langVersion;
    return [
      { key: 'hideJoinButton', label: t('settingHideJoinButton'), checked: settings.hideJoinButton, onchange: (v: boolean) => update('hideJoinButton', v) },
      { key: 'hideSubscribeButton', label: t('settingHideSubscribeButton'), checked: settings.hideSubscribeButton, onchange: (v: boolean) => update('hideSubscribeButton', v) },
      { key: 'hideLikeDislike', label: t('settingHideLikeDislike'), checked: settings.hideLikeDislike, onchange: (v: boolean) => update('hideLikeDislike', v) },
      { key: 'hideShareButton', label: t('settingHideShareButton'), checked: settings.hideShareButton, onchange: (v: boolean) => update('hideShareButton', v) },
      { key: 'hideDownloadButton', label: t('settingHideDownloadButton'), checked: settings.hideDownloadButton, onchange: (v: boolean) => update('hideDownloadButton', v) },
      { key: 'hideClipButton', label: t('settingHideClipButton'), checked: settings.hideClipButton, onchange: (v: boolean) => update('hideClipButton', v) },
      { key: 'hideThanksButton', label: t('settingHideThanksButton'), checked: settings.hideThanksButton, onchange: (v: boolean) => update('hideThanksButton', v) },
      { key: 'hideSaveButton', label: t('settingHideSaveButton'), checked: settings.hideSaveButton, onchange: (v: boolean) => update('hideSaveButton', v) },
    ];
  });

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
          <div class="logo-section">
            <span class="logo-label">{t('settingCustomLogo')}</span>
            {#if settings.customLogo}
              <div class="logo-preview-row">
                <img src={settings.customLogo} alt="" class="logo-preview" />
                <button class="data-btn" onclick={removeLogo}>{t('customLogoRemove')}</button>
              </div>
            {:else}
              <button class="data-btn" onclick={openLogoPage}>{t('customLogoUpload')}</button>
            {/if}
          </div>
        </SettingsSection>

        <SettingsSection title={t('sectionWatchPage')}>
          <Toggle label={t('settingClassicPlayer')} checked={settings.classicPlayer} onchange={(v) => update('classicPlayer', v)} />
          <Toggle label={t('settingAdaptiveDescription')} checked={settings.adaptiveColorsDescription} onchange={(v) => update('adaptiveColorsDescription', v)} />
          <Toggle label={t('settingWidePlayer')} checked={settings.widePlayer} onchange={(v) => update('widePlayer', v)} />
          <Toggle label={t('settingClassicLikeIcons')} checked={settings.classicLikeIcons} onchange={(v) => update('classicLikeIcons', v)} />
        </SettingsSection>

        <SettingsSection title={t('sectionVideoButtons')}>
          <FilterGroup filters={videoButtonFilters} />
        </SettingsSection>

        <SettingsSection title={t('sectionBannerStyle')}>
          <div class="effect-picker">
            {#each BANNER_STYLES as style (style.id)}
              <button
                class="effect-option"
                class:active={settings.bannerStyle === style.id}
                onclick={() => update('bannerStyle', style.id)}
              >
                {t(style.label)}
              </button>
            {/each}
          </div>
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

        <SettingsSection title={t('sectionThumbnailShape')}>
          <div class="effect-picker">
            {#each THUMBNAIL_SHAPES as shape (shape.id)}
              <button
                class="effect-option"
                class:active={settings.thumbnailShape === shape.id}
                onclick={() => update('thumbnailShape', shape.id)}
              >
                {t(shape.label)}
              </button>
            {/each}
          </div>
        </SettingsSection>
        <SettingsSection title={t('sectionData')}>
          <div class="data-section">
            <div class="data-row">
              <span class="data-label">{t('exportJSON')}/{t('exportTXT')}</span>
              <div class="data-actions">
                <button class="data-btn" onclick={() => exportFile('json')}>{t('exportJSON')}</button>
                <button class="data-btn" onclick={() => exportFile('txt')}>{t('exportTXT')}</button>
                <button class="data-btn" onclick={copyToClipboard}>{t('copyClipboard')}</button>
              </div>
            </div>
            <div class="data-row">
              <span class="data-label">{t('importSettings')}</span>
              <div class="data-actions">
                <button class="data-btn" onclick={openImportPage}>{t('importSettings')}</button>
                <button class="data-btn" onclick={pasteFromClipboard}>{t('pasteClipboard')}</button>
              </div>
            </div>
            {#if dataFeedback}
              <div class="data-feedback" class:data-feedback-ok={dataFeedback === 'copied' || dataFeedback === 'imported'} class:data-feedback-err={dataFeedback === 'error'}>
                {dataFeedback === 'copied' ? t('copiedToClipboard') : dataFeedback === 'imported' ? t('importSuccess') : t('importError')}
              </div>
            {/if}
          </div>
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

    /* Motion — M3 Expressive */
    --md-easing-standard: cubic-bezier(0.2, 0, 0, 1);
    --md-easing-emphasized: cubic-bezier(0.2, 0, 0, 1);
    --md-easing-emphasized-decel: cubic-bezier(0.05, 0.7, 0.1, 1);
    --md-easing-emphasized-accel: cubic-bezier(0.3, 0, 0.8, 0.15);
    --md-duration-short: 0.2s;
    --md-duration-medium: 0.35s;
    --md-duration-long: 0.5s;

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

  /* Respect reduced motion preference — disable all animations */
  @media (prefers-reduced-motion: reduce) {
    :root {
      --md-duration-short: 0s;
      --md-duration-medium: 0s;
      --md-duration-long: 0s;
    }
    :global(*),
    :global(*::before),
    :global(*::after) {
      animation-duration: 0s !important;
      transition-duration: 0s !important;
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

  /* --- M3 Entrance Animations --- */

  @keyframes headerSlideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes sectionSlideIn {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes feedbackSlideIn {
    from { opacity: 0; transform: translateY(-4px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes footerFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .app-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--md-surface);
    border-bottom: 1px solid var(--md-outline-variant);
    animation: headerSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) both;
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
    transform: scale(0.9);
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
      transform: scaleY(0.85) scaleX(0.95);
    }
    to {
      opacity: 1;
      transform: scaleY(1) scaleX(1);
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
    transform: scale(0.95);
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

  /* Logo upload section */
  .logo-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 12px;
    gap: 8px;
  }

  .logo-label {
    font-size: 13px;
    color: var(--md-on-surface-variant);
  }

  .logo-preview-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo-preview {
    height: 20px;
    max-width: 80px;
    object-fit: contain;
    border-radius: var(--md-shape-xs);
    border: 1px solid var(--md-outline-variant);
  }

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

  .effect-option:active {
    transform: scale(0.95);
  }

  .effect-option.active {
    background: var(--md-primary);
    color: var(--md-on-primary);
    border-color: var(--md-primary);
  }

  .app-body {
    padding-bottom: 8px;
  }

  /* M3 stagger animation for sections */
  .app-body > :global(:nth-child(1)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.04s both; }
  .app-body > :global(:nth-child(2)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.07s both; }
  .app-body > :global(:nth-child(3)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.10s both; }
  .app-body > :global(:nth-child(4)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.13s both; }
  .app-body > :global(:nth-child(5)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.16s both; }
  .app-body > :global(:nth-child(6)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.19s both; }
  .app-body > :global(:nth-child(7)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.22s both; }
  .app-body > :global(:nth-child(8)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.25s both; }
  .app-body > :global(:nth-child(9)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.28s both; }
  .app-body > :global(:nth-child(10)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.31s both; }
  .app-body > :global(:nth-child(11)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.34s both; }
  .app-body > :global(:nth-child(n+12)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.37s both; }

  .app-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px 16px 24px;
    font-size: 13px;
    color: var(--md-on-surface-variant);
    animation: footerFadeIn var(--md-duration-long) var(--md-easing-emphasized-decel) 0.4s both;
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

  /* --- Export / Import --- */

  .data-section {
    padding: 8px 16px 12px;
  }

  .data-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    gap: 8px;
  }

  .data-label {
    font-size: 13px;
    color: var(--md-on-surface-variant);
    white-space: nowrap;
  }

  .data-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .data-btn {
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    padding: 5px 12px;
    border: 1px solid var(--md-outline-variant);
    border-radius: var(--md-shape-full);
    background: transparent;
    color: var(--md-primary);
    cursor: pointer;
    transition: all var(--md-duration-short) var(--md-easing-standard);
  }

  .data-btn:hover {
    background: var(--md-primary-container);
  }

  .data-btn:active {
    transform: scale(0.95);
  }


  .data-feedback {
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: var(--md-shape-sm);
    text-align: center;
    animation: feedbackSlideIn var(--md-duration-short) var(--md-easing-emphasized-decel) both;
  }

  .data-feedback-ok {
    color: #2e7d32;
    background: #e8f5e9;
  }

  @media (prefers-color-scheme: dark) {
    .data-feedback-ok {
      color: #81c784;
      background: rgba(129, 199, 132, 0.12);
    }
  }

  .data-feedback-err {
    color: var(--md-error);
    background: rgba(186, 26, 26, 0.08);
  }

</style>
