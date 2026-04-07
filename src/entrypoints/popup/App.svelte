<script lang="ts">
  import { DEFAULT_SETTINGS, loadSettings, saveSettings, PROFILES, type Settings, type CustomProfile } from '@/lib/settings';
  import { t, setLocale, allTranslations } from '@/lib/i18n';
  import SettingsSection from '@/components/SettingsSection.svelte';
  import Toggle from '@/components/Toggle.svelte';
  import Slider from '@/components/Slider.svelte';
  import ShapePicker from '@/components/ShapePicker.svelte';
  import ChipGroup from '@/components/ChipGroup.svelte';

  let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  let loaded = $state(false);
  let langVersion = $state(0);
  let langMenuOpen = $state(false);

  // Search
  let searchQuery = $state('');
  let searchFocused = $state(false);

  // Export/Import
  type DataFeedback = '' | 'copied' | 'imported' | 'error' | 'profile';
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

  const AMO_URL = 'https://addons.mozilla.org/firefox/addon/youtube-rewind/';
  const isFirefox = browser.runtime.getURL('').startsWith('moz-extension://');

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
      // Firefox users get AMO link, Chromium users get GitHub releases
      const url = isFirefox
        ? AMO_URL
        : (data.html_url || 'https://github.com/crixqq/YouTube-Rewind/releases');

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

  // Track whether current profile has been modified
  let profileModified = $state(false);

  function cloneCustomProfiles(profiles: CustomProfile[] = []): CustomProfile[] {
    return profiles.map((profile) => ({
      ...profile,
      settings: { ...profile.settings },
    }));
  }

  function cloneSettings(next: Settings): Settings {
    return {
      ...next,
      customProfiles: cloneCustomProfiles(next.customProfiles || []),
    };
  }

  function patchLocalSettings(partial: Partial<Settings>): void {
    const previousLanguage = settings.language;
    settings = cloneSettings({
      ...settings,
      ...partial,
      customProfiles: 'customProfiles' in partial
        ? [...(partial.customProfiles || [])]
        : [...(settings.customProfiles || [])],
    });
    if ('language' in partial && settings.language !== previousLanguage) {
      setLocale(settings.language);
      langVersion++;
    }
  }

  async function applySettingsPatch(partial: Partial<Settings>, markProfileModified = false): Promise<void> {
    patchLocalSettings(partial);
    if (markProfileModified && settings.activeProfile !== 'none') {
      profileModified = true;
    }
    await saveSettings(partial);
  }

  // Init once on mount — no reactive deps, so $effect runs only once
  $effect(() => {
    loadSettings().then((s) => {
      settings = cloneSettings(s);
      setLocale(s.language);
      langVersion++;
      loaded = true;
      checkForUpdates();
    });
  });

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    void applySettingsPatch({ [key]: value } as Pick<Settings, K>, key !== 'activeProfile');
  }

  function saveChangesToProfile() {
    const activeId = settings.activeProfile;
    if (!activeId || activeId === 'none') return;

    if (activeId.startsWith('custom:')) {
      const name = activeId.slice(7);
      const profiles = [...(settings.customProfiles || [])];
      const idx = profiles.findIndex((p) => p.name === name);
      if (idx >= 0) {
        const { language, customProfiles: _, activeProfile: __, ...profileSettings } = settings;
        profiles[idx] = { ...profiles[idx], settings: profileSettings };
        const nextProfiles = cloneCustomProfiles(profiles);
        patchLocalSettings({ customProfiles: nextProfiles });
        void saveSettings({ customProfiles: nextProfiles });
      }
    } else {
      // Built-in profile modified — save as new custom profile with the built-in name + "(modified)"
      const name = activeId + ' *';
      const { language, customProfiles: _, activeProfile: __, ...profileSettings } = settings;
      const newProfile: CustomProfile = { name, settings: profileSettings };
      const profiles = cloneCustomProfiles([...(settings.customProfiles || []), newProfile]);
      patchLocalSettings({
        customProfiles: profiles,
        activeProfile: 'custom:' + name,
      });
      void saveSettings({
        customProfiles: profiles,
        activeProfile: 'custom:' + name,
      });
    }
    profileModified = false;
    showFeedback('profile');
  }

  /** Check if a setting key matches the search query across all languages. */
  function matchesSearch(keys: string[]): boolean {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    for (const key of keys) {
      // Check all language translations for this key
      const texts = allTranslations(key);
      if (texts.some((txt) => txt.includes(q))) return true;
      // Also check the key itself
      if (key.toLowerCase().includes(q)) return true;
    }
    return false;
  }

  /** Check if any key in the section matches. */
  function sectionVisible(keys: string[]): boolean {
    if (!searchQuery.trim()) return true;
    return keys.some((k) => matchesSearch([k]));
  }

  function selectLanguage(lang: string) {
    patchLocalSettings({ language: lang });
    void saveSettings({ language: lang });
    langMenuOpen = false;
  }

  function openLogoPage() {
    browser.tabs.create({ url: browser.runtime.getURL('logo.html') });
  }

  function removeLogo() {
    patchLocalSettings({
      customLogo: '',
      customLogoRatio: 0,
    });
    void saveSettings({
      customLogo: '',
      customLogoRatio: 0,
    });
  }

  function toggleLangMenu() {
    langMenuOpen = !langMenuOpen;
  }

  function scrollToAbout() {
    const el = document.getElementById('ytr-about');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      content = Object.entries(exportData).map(([k, v]) => `${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
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
        else {
          // Try parsing JSON values (for arrays/objects)
          try { result[k] = JSON.parse(v); } catch { result[k] = v; }
        }
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
    patchLocalSettings(filtered);
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

  // --- Profiles ---

  function applyProfile(profileId: string) {
    if (profileId === 'none') {
      update('activeProfile', 'none');
      profileModified = false;
      return;
    }
    const profile = PROFILES[profileId];
    if (!profile) return;

    const resetData = { ...DEFAULT_SETTINGS };
    delete (resetData as any).language;
    delete (resetData as any).customLogo;
    delete (resetData as any).customLogoRatio;
    delete (resetData as any).customProfiles;
    const merged = { ...resetData, ...profile, activeProfile: profileId };
    patchLocalSettings(merged);
    void saveSettings(merged);
    profileModified = false;
    showFeedback('profile');
  }

  // --- Section Icons (Material Symbols Rounded, filled) ---
  const ICON = {
    tune: 'M435.5-128.63Q427-137.25 427-150v-165q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v53h323q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H487v52q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63ZM150-202q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h187q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H150Zm165.5-174.63Q307-385.25 307-398v-52H150q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h157v-54q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v166q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63ZM457-450q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h353q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H457Zm144.5-173.63Q593-632.25 593-645v-165q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v52h157q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H653v53q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63ZM150-698q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h353q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H150Z',
    play_circle: 'm418-332 202-129q11-7 11-19t-11-19L418-628q-11-8-23-1.5T383-609v258q0 14 12 20.5t23-1.5Zm62 252q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Z',
    visibility: 'M600.5-379.62q49.5-49.62 49.5-120.5T600.38-620.5Q550.76-670 479.88-670T359.5-620.38Q310-570.76 310-499.88t49.62 120.38q49.62 49.5 120.5 49.5t120.38-49.62Zm-200-41.12q-32.5-32.73-32.5-79.5 0-46.76 32.74-79.26 32.73-32.5 79.5-32.5 46.76 0 79.26 32.74 32.5 32.73 32.5 79.5 0 46.76-32.74 79.26-32.73 32.5-79.5 32.5-46.76 0-79.26-32.74ZM234.5-276Q124-352 57-470q-4-7.13-6-14.65-2-7.52-2-15.43 0-7.92 2-15.38 2-7.47 6-14.54 67-118 177.5-194T480-800q135 0 245.5 76T903-530q4 7.12 6 14.65 2 7.52 2 15.43 0 7.92-2 15.38-2 7.47-6 14.54-67 118-177.5 194T480-200q-135 0-245.5-76Z',
    timer: 'M390-860q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h180q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H390Zm111.5 438.37q8.5-8.62 8.5-21.37v-170q0-12.75-8.68-21.38-8.67-8.62-21.5-8.62-12.82 0-21.32 8.62-8.5 8.63-8.5 21.38v170q0 12.75 8.68 21.37 8.67 8.63 21.5 8.63 12.82 0 21.32-8.63Zm-161 312.13Q275-138 226-187t-77.5-114.5Q120-367 120-441t28.5-139.5Q177-646 226-695t114.5-77.5Q406-801 480-801q67 0 125.5 22T710-717l30-30q9-9 21.5-9t21.5 9q9 9 9 21.5t-9 21.5l-30 30q36 40 61.5 97T840-441q0 74-28.5 139.5T734-187q-49 49-114.5 77.5T480-81q-74 0-139.5-28.5Z',
    home: 'M160-180v-390q0-14.25 6.38-27 6.37-12.75 17.62-21l260-195q15.68-12 35.84-12Q500-825 516-813l260 195q11.25 8.25 17.63 21 6.37 12.75 6.37 27v390q0 24.75-17.62 42.37Q764.75-120 740-120H590q-12.75 0-21.37-8.63Q560-137.25 560-150v-220q0-12.75-8.62-21.38Q542.75-400 530-400H430q-12.75 0-21.37 8.62Q400-382.75 400-370v220q0 12.75-8.62 21.37Q382.75-120 370-120H220q-24.75 0-42.37-17.63Q160-155.25 160-180Z',
    search: 'M378-329q-108.16 0-183.08-75Q120-479 120-585t75-181q75-75 181.5-75t181 75Q632-691 632-584.85 632-542 618-502q-14 40-42 75l242 240q9 8.56 9 21.78T818-143q-9 9-22.22 9-13.22 0-21.78-9L533-384q-30 26-69.96 40.5Q423.08-329 378-329Zm-1-60q81.25 0 138.13-57.5Q572-504 572-585t-56.87-138.5Q458.25-781 377-781q-82.08 0-139.54 57.5Q180-666 180-585t57.46 138.5Q294.92-389 377-389Z',
    web_asset: 'M140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Zm0-60h680v-436H140v436Z',
    view_sidebar: 'M752-627q-18 0-31.5-13.5T707-672v-83q0-18 13.5-31.5T752-800h83q18 0 31.5 13.5T880-755v83q0 18-13.5 31.5T835-627h-83Zm0 234q-18 0-31.5-13.5T707-438v-84q0-18 13.5-31.5T752-567h83q18 0 31.5 13.5T880-522v84q0 18-13.5 31.5T835-393h-83ZM140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h447q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Zm612 0q-18 0-31.5-13.5T707-205v-83q0-18 13.5-31.5T752-333h83q18 0 31.5 13.5T880-288v83q0 18-13.5 31.5T835-160h-83Z',
    image: 'M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm86-157h429q9 0 13-8t-1-16L590-457q-5-6-12-6t-12 6L446-302l-81-111q-5-6-12-6t-12 6l-86 112q-6 8-2 16t13 8Z',
    person: 'M372-523q-42-42-42-108t42-108q42-42 108-42t108 42q42 42 42 108t-42 108q-42 42-108 42t-108-42ZM160-220v-34q0-38 19-65t49-41q67-30 128.5-45T480-420q62 0 123 15.5T731-360q31 14 50 41t19 65v34q0 25-17.5 42.5T740-160H220q-25 0-42.5-17.5T160-220Z',
    database: 'M740.5-569Q840-618 840-680q0-63-99.5-111.5T480-840q-161 0-260.5 48.5T120-680q0 62 99.5 111T480-520q161 0 260.5-49ZM592-428.5q62-8.5 117.5-26.5t93-46.5Q840-530 840-570v100q0 40-37.5 68.5t-93 46.5Q654-337 592-328.5T480.5-320q-49.5 0-112-8.5t-118-27q-55.5-18.5-93-47T120-470v-100q0 39 37.5 67.5t93 47q55.5 18.5 118 27t112 8.5q49.5 0 111.5-8.5Zm0 200q62-8.5 117.5-26.5t93-46.5Q840-330 840-370v100q0 40-37.5 68.5t-93 46.5Q654-137 592-128.5T480.5-120q-49.5 0-112-8.5t-118-27q-55.5-18.5-93-47T120-270v-100q0 39 37.5 67.5t93 47q55.5 18.5 118 27t112 8.5q49.5 0 111.5-8.5Z',
    info: 'M504.5-288.63q8.5-8.62 8.5-21.37v-180q0-12.75-8.68-21.38-8.67-8.62-21.5-8.62-12.82 0-21.32 8.62-8.5 8.63-8.5 21.38v180q0 12.75 8.68 21.37 8.67 8.63 21.5 8.63 12.82 0 21.32-8.63Zm-1-314.57q9.5-9.2 9.5-22.8 0-14.45-9.48-24.22-9.48-9.78-23.5-9.78t-23.52 9.78Q447-640.45 447-626q0 13.6 9.48 22.8 9.48 9.2 23.5 9.2t23.52-9.2ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Z',
  } as const;

  // --- Custom Profiles ---

  let showProfileAdd = $state(false);
  let profileNameInput = $state('');
  let showResetConfirm = $state(false);
  let renamingProfileIndex = $state(-1);
  let renameInput = $state('');

  function saveCurrentAsProfile() {
    const name = profileNameInput.trim();
    if (!name) return;
    const { language, customProfiles: _, activeProfile: __, ...profileSettings } = settings;
    const newProfile: CustomProfile = { name, settings: profileSettings };
    const profiles = cloneCustomProfiles([...(settings.customProfiles || []), newProfile]);
    patchLocalSettings({ customProfiles: profiles });
    void saveSettings({ customProfiles: profiles });
    profileNameInput = '';
    showProfileAdd = false;
    showFeedback('profile');
  }

  function importProfileFromFile() {
    browser.tabs.create({ url: browser.runtime.getURL('import.html?mode=profile') });
  }

  function deleteCustomProfile(index: number) {
    const profiles = cloneCustomProfiles(settings.customProfiles || []);
    const wasActive = settings.activeProfile === 'custom:' + profiles[index]?.name;
    profiles.splice(index, 1);
    patchLocalSettings({
      customProfiles: profiles,
      activeProfile: wasActive ? 'none' : settings.activeProfile,
    });
    void saveSettings({
      customProfiles: profiles,
      activeProfile: wasActive ? 'none' : settings.activeProfile,
    });
    if (wasActive) profileModified = false;
  }

  function startRenameProfile(index: number) {
    renamingProfileIndex = index;
    renameInput = (settings.customProfiles || [])[index]?.name || '';
  }

  function commitRenameProfile() {
    const idx = renamingProfileIndex;
    renamingProfileIndex = -1;
    const name = renameInput.trim();
    if (!name || idx < 0) return;
    const profiles = cloneCustomProfiles(settings.customProfiles || []);
    if (!profiles[idx]) return;
    const wasActive = settings.activeProfile === 'custom:' + profiles[idx].name;
    profiles[idx] = { ...profiles[idx], name };
    patchLocalSettings({
      customProfiles: profiles,
      activeProfile: wasActive ? 'custom:' + name : settings.activeProfile,
    });
    void saveSettings({
      customProfiles: profiles,
      activeProfile: wasActive ? 'custom:' + name : settings.activeProfile,
    });
  }

  function applyCustomProfile(profile: CustomProfile) {
    const resetData = { ...DEFAULT_SETTINGS };
    delete (resetData as any).language;
    delete (resetData as any).customProfiles;
    delete (resetData as any).activeProfile;

    const profileSettings = { ...profile.settings };
    delete (profileSettings as any).customProfiles;
    delete (profileSettings as any).language;
    delete (profileSettings as any).activeProfile;

    const merged = { ...resetData, ...profileSettings, activeProfile: 'custom:' + profile.name };
    patchLocalSettings(merged);
    void saveSettings(merged);
    profileModified = false;
    showFeedback('profile');
  }

  async function resetAllSettings() {
    const resetData = { ...DEFAULT_SETTINGS };
    settings = cloneSettings(resetData);
    setLocale(resetData.language);
    langVersion++;
    await saveSettings(resetData);
    profileModified = false;
    showResetConfirm = false;
    showFeedback('imported');
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
      { key: 'hidePlayables', label: t('settingHidePlayables'), checked: settings.hidePlayables, onchange: (v: boolean) => update('hidePlayables', v) },
      { key: 'hideFilterBar', label: t('settingHideFilterBar'), checked: settings.hideFilterBar, onchange: (v: boolean) => update('hideFilterBar', v) },
      { key: 'disableAvatarLiveRedirect', label: t('settingDisableAvatarLive'), checked: settings.disableAvatarLiveRedirect, onchange: (v: boolean) => update('disableAvatarLiveRedirect', v) },
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

  // Speed slider: value = speed * 4 (0=default, 1=0.25x, ..., 20=5.0x)
  function speedToSlider(speed: number): number { return Math.round(speed * 4); }
  function sliderToSpeed(v: number): number { return v * 0.25; }
  function formatSpeed(v: number): string {
    if (v === 0) return t('speedDefault');
    const speed = v * 0.25;
    return `${speed % 1 === 0 ? speed.toFixed(0) : speed}x`;
  }
  function parseSpeed(text: string): number {
    const n = parseFloat(text.replace('x', ''));
    if (isNaN(n)) return 0;
    return Math.round(n / 0.25);
  }

  // Quality slider: index-based (0=auto, 1=144p, ..., 9=4320p)
  const QUALITY_STEPS = ['auto', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', '4320p'];
  const QUALITY_LABELS: Record<string, string> = { 'auto': '', '4320p': '8K', '2160p': '4K' };
  function qualityToSlider(q: string): number {
    const idx = QUALITY_STEPS.indexOf(q);
    return idx >= 0 ? idx : 0;
  }
  function sliderToQuality(v: number): string { return QUALITY_STEPS[v] || 'auto'; }
  function formatQuality(v: number): string {
    const q = QUALITY_STEPS[v] || 'auto';
    if (q === 'auto') return t('qualityAuto');
    return QUALITY_LABELS[q] || q;
  }
  const PROFILE_OPTIONS = [
    { id: 'none', label: 'profileNone' },
    { id: 'focus', label: 'profileFocus' },
    { id: 'minimal', label: 'profileMinimal' },
    { id: 'clean', label: 'profileClean' },
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
          <img src="/logo-header.png" alt="YouTube Rewind" class="app-logo" />
          <div class="header-actions">
            <button class="info-button" onclick={scrollToAbout} title={t('sectionAbout')} aria-label={t('sectionAbout')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>
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

      <!-- Search bar -->
      <div class="search-bar" class:focused={searchFocused}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          class="search-input"
          placeholder={t('searchPlaceholder')}
          bind:value={searchQuery}
          onfocus={() => { searchFocused = true; }}
          onblur={() => { searchFocused = false; }}
        />
        {#if searchQuery}
          <button class="search-clear" onclick={() => { searchQuery = ''; }} aria-label="Clear">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        {/if}
      </div>

      <main class="app-body">
        <SettingsSection title={t('sectionProfiles')} icon={ICON.tune} hidden={!!searchQuery.trim()}>
          <div class="effect-picker">
            {#each PROFILE_OPTIONS as profile (profile.id)}
              <button
                class="effect-option"
                class:active={settings.activeProfile === profile.id}
                onclick={() => applyProfile(profile.id)}
              >
                {t(profile.label)}
              </button>
            {/each}
            {#each settings.customProfiles || [] as cp, i}
              <div class="custom-profile-chip">
                {#if renamingProfileIndex === i}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input
                    class="profile-rename-input"
                    type="text"
                    bind:value={renameInput}
                    onblur={commitRenameProfile}
                    onkeydown={(e) => { if (e.key === 'Enter') commitRenameProfile(); else if (e.key === 'Escape') { renamingProfileIndex = -1; } }}
                    autofocus
                  />
                {:else}
                  <button
                    class="effect-option"
                    class:active={settings.activeProfile === 'custom:' + cp.name}
                    onclick={() => applyCustomProfile(cp)}
                    ondblclick={(e) => { e.preventDefault(); startRenameProfile(i); }}
                    title={t('profileRenameHint')}
                  >
                    {cp.name}
                  </button>
                {/if}
                <button class="custom-profile-delete" onclick={() => deleteCustomProfile(i)} title={t('profileDelete')}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
          {#if profileModified && settings.activeProfile !== 'none'}
            <div class="profile-save-row">
              <button class="action-btn action-btn-save" onclick={saveChangesToProfile}>
                {t('profileSaveChanges')}
              </button>
            </div>
          {/if}
          {#if showProfileAdd}
            <div class="profile-add-card">
              <input
                class="profile-name-input"
                type="text"
                placeholder={t('profileNamePlaceholder')}
                bind:value={profileNameInput}
                onkeydown={(e) => { if (e.key === 'Enter') saveCurrentAsProfile(); else if (e.key === 'Escape') { showProfileAdd = false; } }}
              />
              <div class="profile-add-actions">
                <button class="action-btn" onclick={saveCurrentAsProfile}>{t('profileSaveCurrent')}</button>
                <button class="action-btn" onclick={importProfileFromFile}>{t('profileFromFile')}</button>
                <button class="action-btn profile-add-cancel" onclick={() => { showProfileAdd = false; }} aria-label="Cancel">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          {:else}
            <div class="profile-add-trigger">
              <button class="action-btn" onclick={() => { showProfileAdd = true; }} aria-label="Add profile">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
          {/if}
          {#if dataFeedback === 'profile'}
            <div class="data-feedback data-feedback-ok" style="margin: 0 10px 8px;">
              {t('profileApplied')}
            </div>
          {/if}
        </SettingsSection>

        <SettingsSection title={t('sectionPlayer')} icon={ICON.play_circle} hidden={!sectionVisible(['settingPlaybackSpeed', 'settingDefaultQuality', 'settingDownloadThumbnail', 'settingClassicPlayer', 'settingWidePlayer', 'settingClassicLikeIcons', 'settingAdaptiveDescription'])}>
          <Slider
            label={t('settingPlaybackSpeed')}
            value={speedToSlider(settings.playbackSpeed)}
            min={0}
            max={20}
            defaultLabel={t('speedDefault')}
            formatDisplay={formatSpeed}
            parseInput={parseSpeed}
            onchange={(v) => update('playbackSpeed', sliderToSpeed(v))}
          />
          <Slider
            label={t('settingDefaultQuality')}
            value={qualityToSlider(settings.defaultQuality)}
            min={0}
            max={9}
            defaultLabel={t('qualityAuto')}
            formatDisplay={formatQuality}
            onchange={(v) => update('defaultQuality', sliderToQuality(v))}
          />
          <Toggle label={t('settingDownloadThumbnail')} checked={settings.downloadThumbnailButton} onchange={(v) => update('downloadThumbnailButton', v)} />
          <Toggle label={t('settingClassicPlayer')} checked={settings.classicPlayer} onchange={(v) => update('classicPlayer', v)} />
          <Toggle label={t('settingWidePlayer')} checked={settings.widePlayer} onchange={(v) => update('widePlayer', v)} />
          <Toggle label={t('settingAdaptiveDescription')} checked={settings.adaptiveColorsDescription} onchange={(v) => update('adaptiveColorsDescription', v)} />
          <Toggle label={t('settingClassicLikeIcons')} checked={settings.classicLikeIcons} onchange={(v) => update('classicLikeIcons', v)} />
        </SettingsSection>

        <SettingsSection title={t('sectionWatchPage')} icon={ICON.visibility} hidden={!sectionVisible(['settingHideJoinButton', 'settingHideSubscribeButton', 'settingHideLikeDislike', 'settingHideShareButton', 'settingHideDownloadButton', 'settingHideClipButton', 'settingHideThanksButton', 'settingHideSaveButton', 'sectionBannerStyle'])}>
          <ChipGroup filters={videoButtonFilters} />
          <div class="sub-label">{t('sectionBannerStyle')}</div>
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

        <SettingsSection title={t('sectionWatchTimer')} icon={ICON.timer} hidden={!sectionVisible(['settingWatchTimerEnabled', 'settingWatchTimeLimit', 'settingWatchTimeLimitBlockRepeat'])}>
          <Toggle label={t('settingWatchTimerEnabled')} checked={settings.watchTimerEnabled} onchange={(v) => update('watchTimerEnabled', v)} />
          <Slider
            label={t('settingWatchTimeLimit')}
            value={settings.watchTimeLimitMinutes}
            min={0}
            max={480}
            defaultLabel={t('watchTimeLimitNone')}
            onchange={(v) => update('watchTimeLimitMinutes', v)}
          />
          {#if settings.watchTimeLimitMinutes > 0}
            <Toggle label={t('settingWatchTimeLimitBlockRepeat')} checked={settings.watchTimeLimitBlockRepeat} onchange={(v) => update('watchTimeLimitBlockRepeat', v)} />
          {/if}
        </SettingsSection>

        <SettingsSection title={t('sectionHomepageFilter')} icon={ICON.home} hidden={!sectionVisible(['settingVideosPerRow', 'settingHideShorts', 'settingHidePosts', 'settingHideMixes', 'settingHideBreakingNews', 'settingHideLatestPosts', 'settingHideExploreTopics', 'settingHideNewBadge', 'settingHidePlayables', 'settingHideFilterBar', 'settingDisableAvatarLive'])}>
          <Slider
            label={t('settingVideosPerRow')}
            value={settings.videosPerRow}
            min={0}
            max={8}
            defaultLabel={t('settingVideosPerRowDefault')}
            onchange={(v) => update('videosPerRow', v)}
          />
          <ChipGroup filters={homepageFilters} />
        </SettingsSection>

        <SettingsSection title={t('sectionSearchFilter')} icon={ICON.search} hidden={!sectionVisible(['settingHideSearchShorts', 'settingHideSearchChannels', 'settingHideSearchPeopleWatched'])}>
          <ChipGroup filters={searchFilters} />
        </SettingsSection>

        <SettingsSection title={t('sectionTopBar')} icon={ICON.web_asset} hidden={!sectionVisible(['settingHideTopbarCreate', 'settingHideTopbarVoiceSearch', 'settingHideTopbarNotifications', 'settingHideTopbarSearch', 'settingHideCountryCode', 'settingCustomLogo', 'settingHideLogoAnimation'])}>
          <ChipGroup filters={topbarFilters} />
          <div class="inline-row">
            <span class="inline-label">{t('settingCustomLogo')}</span>
            <div class="inline-actions">
              {#if settings.customLogo}
                <img src={settings.customLogo} alt="" class="logo-preview" />
              {/if}
              <button class="action-btn" onclick={openLogoPage}>{t('customLogoUpload')}</button>
              {#if settings.customLogo}
                <button class="action-btn" onclick={removeLogo}>{t('customLogoRemove')}</button>
              {/if}
            </div>
          </div>
          <Toggle label={t('settingHideLogoAnimation')} checked={settings.hideLogoAnimation} onchange={(v) => update('hideLogoAnimation', v)} />
        </SettingsSection>

        <SettingsSection title={t('sectionSidebarFilter')} icon={ICON.view_sidebar} hidden={!sectionVisible(['settingHideSidebarSubscriptions', 'settingHideSidebarYou', 'settingHideSidebarExplore', 'settingHideSidebarMoreFromYT', 'settingHideSidebarReportHistory', 'settingHideSidebarFooter'])}>
          <ChipGroup filters={sidebarFilters} />
        </SettingsSection>

        <SettingsSection title={t('sectionThumbnailEffect')} icon={ICON.image} hidden={!sectionVisible(['sectionThumbnailEffect', 'thumbnailHoverReveal', 'settingDisableHoverAnimation', 'sectionThumbnailShape'])}>
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
          <div class="sub-label">{t('sectionThumbnailShape')}</div>
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

        <SettingsSection title={t('sectionAvatarShape')} icon={ICON.person} hidden={!sectionVisible(['sectionAvatarShape'])}>
          <ShapePicker variant="avatar" value={settings.avatarShape} onchange={(v) => update('avatarShape', v)} />
        </SettingsSection>

        <SettingsSection title={t('sectionData')} icon={ICON.database} hidden={!!searchQuery.trim()}>
          <div class="data-section">
            <div class="data-group">
              <div class="data-group-label">{t('exportLabel')}</div>
              <div class="data-actions">
                <button class="action-btn" onclick={() => exportFile('json')}>{t('exportJSON')}</button>
                <button class="action-btn" onclick={() => exportFile('txt')}>{t('exportTXT')}</button>
                <button class="action-btn" onclick={copyToClipboard}>{t('copyClipboard')}</button>
              </div>
            </div>
            <div class="data-divider"></div>
            <div class="data-group">
              <div class="data-group-label">{t('importLabel')}</div>
              <div class="data-actions">
                <button class="action-btn" onclick={openImportPage}>{t('importSettings')}</button>
                <button class="action-btn" onclick={pasteFromClipboard}>{t('pasteClipboard')}</button>
              </div>
            </div>
            <div class="data-divider"></div>
            <div class="data-group">
              <button class="action-btn action-btn-danger" onclick={() => { showResetConfirm = true; }}>{t('resetSettings')}</button>
            </div>
            {#if showResetConfirm}
              <div class="reset-confirm">
                <div class="reset-confirm-title">{t('resetConfirmTitle')}</div>
                <div class="reset-confirm-message">{t('resetConfirmMessage')}</div>
                <div class="reset-confirm-actions">
                  <button class="action-btn" onclick={() => { showResetConfirm = false; }}>{t('resetCancelButton')}</button>
                  <button class="action-btn action-btn-danger" onclick={resetAllSettings}>{t('resetConfirmButton')}</button>
                </div>
              </div>
            {/if}
            {#if dataFeedback && dataFeedback !== 'profile'}
              <div class="data-feedback" class:data-feedback-ok={dataFeedback === 'copied' || dataFeedback === 'imported'} class:data-feedback-err={dataFeedback === 'error'}>
                {dataFeedback === 'copied' ? t('copiedToClipboard') : dataFeedback === 'imported' ? t('importSuccess') : t('importError')}
              </div>
            {/if}
          </div>
        </SettingsSection>
      </main>

      <footer class="app-footer" id="ytr-about">
        <p class="about-description">{t('aboutDescription')}</p>
        <div class="about-links">
          <a class="about-link" href="https://t.me/ytrewind_extension" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            {t('aboutTelegram')}
          </a>
          <a class="about-link" href="https://addons.mozilla.org/firefox/addon/youtube-rewind/" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8.824 7.287c.008 0 .004 0 0 0zm-2.8-1.4c.006 0 .003 0 0 0zm16.754 2.161c-.505-1.215-1.53-2.528-2.333-2.943.654 1.283 1.033 2.57 1.177 3.53l.002.02c-1.314-3.278-3.544-4.6-5.366-7.477-.091-.147-.184-.292-.273-.446a3.545 3.545 0 01-.13-.24 2.118 2.118 0 01-.172-.46.03.03 0 00-.027-.03.038.038 0 00-.021 0l-.006.001a.037.037 0 00-.01.005L15.624 0c-2.585 1.515-3.657 4.168-3.932 5.856a6.197 6.197 0 00-2.305.587.297.297 0 00-.147.37c.057.162.24.24.396.17a5.622 5.622 0 012.008-.523l.067-.005a5.847 5.847 0 011.957.222l.095.03a5.816 5.816 0 01.616.228c.08.036.16.073.238.112l.107.055a5.835 5.835 0 01.368.211 5.953 5.953 0 012.034 2.104c-.62-.437-1.733-.868-2.803-.681 4.183 2.09 3.06 9.292-2.737 9.02a5.164 5.164 0 01-1.513-.292 4.42 4.42 0 01-.538-.232c-1.42-.735-2.593-2.121-2.74-3.806 0 0 .537-2 3.845-2 .357 0 1.38-.998 1.398-1.287-.005-.095-2.029-.9-2.817-1.677-.422-.416-.622-.616-.8-.767a3.47 3.47 0 00-.301-.227 5.388 5.388 0 01-.032-2.842c-1.195.544-2.124 1.403-2.8 2.163h-.006c-.46-.584-.428-2.51-.402-2.913-.006-.025-.343.176-.389.206-.406.29-.787.616-1.136.974-.397.403-.76.839-1.085 1.303a9.816 9.816 0 00-1.562 3.52c-.003.013-.11.487-.19 1.073-.013.09-.026.181-.037.272a7.8 7.8 0 00-.069.667l-.002.034-.023.387-.001.06C.386 18.795 5.593 24 12.016 24c5.752 0 10.527-4.176 11.463-9.661.02-.149.035-.298.052-.448.232-1.994-.025-4.09-.753-5.844z"/></svg>
            {t('aboutFirefox')}
          </a>
          <a class="about-link" href="https://github.com/crixqq/YouTube-Rewind" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
            {t('aboutGitHub')}
          </a>
        </div>
        <div class="about-creator">
          {t('aboutCreator')} <a href="https://github.com/crixqq" target="_blank" rel="noopener">crixqq</a>
        </div>
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
    animation: popupEnter 0.3s var(--md-easing-emphasized-decel) both;
    scroll-behavior: smooth;
  }

  :global(#app) {
    display: flex;
    flex-direction: column;
  }

  :global(body::-webkit-scrollbar) {
    width: 6px;
  }

  :global(body::-webkit-scrollbar-thumb) {
    background: var(--md-outline-variant);
    border-radius: var(--md-shape-full);
    border: 1px solid transparent;
    background-clip: content-box;
  }

  :global(body::-webkit-scrollbar-thumb:hover) {
    background: var(--md-outline);
    background-clip: content-box;
  }

  :global(body::-webkit-scrollbar-thumb:active) {
    background: var(--md-primary);
    background-clip: content-box;
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
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes popupEnter {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes searchBarSlideIn {
    from { opacity: 0; transform: translateY(-6px) scaleX(0.95); }
    to { opacity: 1; transform: translateY(0) scaleX(1); }
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

  .app-logo {
    height: 30px;
    width: auto;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }

  @media (prefers-color-scheme: light) {
    .app-logo {
      filter: invert(1);
    }
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
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  }

  .lang-button:hover {
    background: var(--md-surface-container-high);
    transform: scale(1.1);
    color: var(--md-primary);
  }

  .lang-button:active {
    background: var(--md-surface-container-highest);
    transform: scale(0.85);
    transition-duration: 0.06s;
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
    0% {
      opacity: 0;
      transform: scaleY(0.7) scaleX(0.92);
    }
    60% {
      opacity: 1;
      transform: scaleY(1.02) scaleX(1.01);
    }
    100% {
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
    transition: all 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    text-align: left;
    position: relative;
  }

  .lang-menu-item:hover {
    background: var(--md-surface-container-high);
    padding-left: 18px;
  }

  .lang-menu-item:active {
    background: var(--md-surface-container-highest);
    transform: scale(0.97);
    transition-duration: 0.06s;
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
    transition: all 0.15s cubic-bezier(0.2, 0, 0, 1);
  }

  .version-button:hover {
    background: var(--md-surface-container-high);
    transform: scale(1.05);
  }

  .version-button:active {
    background: var(--md-surface-container-highest);
    transform: scale(0.92);
    transition-duration: 0.06s;
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
    animation: dotPulse 2s ease-in-out infinite;
  }

  @keyframes dotPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.3); }
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
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    justify-content: center;
  }

  .update-download:hover {
    opacity: 0.9;
    text-decoration: none;
    transform: scale(1.02);
    box-shadow: 0 2px 8px rgba(91, 80, 145, 0.3);
  }

  .update-download:active {
    transform: scale(0.96);
    transition-duration: 0.06s;
  }

  /* Inline row (logo, etc.) */
  .inline-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    gap: 8px;
  }

  .inline-label {
    font-size: 13px;
    color: var(--md-on-surface-variant);
  }

  .inline-actions {
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
    transition: transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  .logo-preview:hover {
    transform: scale(1.12);
  }

  .sub-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: var(--md-on-surface-variant);
    padding: 8px 10px 0;
    opacity: 0.7;
  }

  .effect-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px 10px;
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
    transition: all 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    position: relative;
    overflow: hidden;
  }

  .effect-option::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
    border-radius: inherit;
  }

  .effect-option:hover::after {
    opacity: 0.05;
  }

  .effect-option:hover {
    background: var(--md-surface-container-high);
    transform: translateY(-2px) scale(1.03);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .effect-option:active {
    transform: scale(0.91);
    box-shadow: none;
    transition-duration: 0.06s;
  }

  .effect-option.active {
    background: var(--md-primary);
    color: var(--md-on-primary);
    border-color: var(--md-primary);
    box-shadow: 0 2px 8px rgba(91, 80, 145, 0.35);
    animation: chipSelect 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  @keyframes chipSelect {
    0% { transform: scale(0.92); }
    50% { transform: scale(1.06); }
    100% { transform: scale(1); }
  }

  .effect-option.active:hover {
    box-shadow: 0 3px 12px rgba(91, 80, 145, 0.4);
    transform: translateY(-2px) scale(1.03);
  }

  .effect-option.active:active {
    transform: scale(0.93);
    box-shadow: 0 1px 4px rgba(91, 80, 145, 0.25);
  }

  /* --- Search Bar --- */

  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 16px 4px;
    padding: 7px 14px;
    background: var(--md-surface-container-low);
    border-radius: var(--md-shape-full);
    border: 1.5px solid transparent;
    transition: all var(--md-duration-short) var(--md-easing-standard);
    color: var(--md-on-surface-variant);
    animation: searchBarSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.08s both;
  }

  .search-bar.focused {
    background: var(--md-surface-container);
    border-color: var(--md-primary);
    box-shadow: 0 0 0 2px rgba(91, 80, 145, 0.15);
    transform: scaleX(1.01);
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 13px;
    font-family: inherit;
    color: var(--md-on-surface);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--md-outline);
  }

  .search-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--md-on-surface-variant);
    cursor: pointer;
    padding: 0;
    transition: all var(--md-duration-short) var(--md-easing-standard);
  }

  .search-clear:hover {
    background: var(--md-surface-container-highest);
    transform: scale(1.15) rotate(90deg);
  }

  .search-clear:active {
    transform: scale(0.85) rotate(90deg);
    transition-duration: 0.06s;
  }

  /* --- Profile Save Changes --- */

  .profile-save-row {
    padding: 4px 10px 8px;
    animation: feedbackSlideIn var(--md-duration-short) var(--md-easing-emphasized-decel) both;
  }

  .action-btn-save {
    background: var(--md-primary);
    color: var(--md-on-primary);
    border-color: var(--md-primary);
    transition: all var(--md-duration-short) var(--md-easing-standard);
  }

  .action-btn-save:hover {
    opacity: 0.92;
    background: var(--md-primary);
    transform: scale(1.02);
  }

  .action-btn-save:active {
    transform: scale(0.97);
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
  .app-body > :global(:nth-child(12)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.37s both; }
  .app-body > :global(:nth-child(13)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.40s both; }
  .app-body > :global(:nth-child(14)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.43s both; }
  .app-body > :global(:nth-child(n+15)) { animation: sectionSlideIn var(--md-duration-medium) var(--md-easing-emphasized-decel) 0.46s both; }

  .info-button {
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
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  }

  .info-button:hover {
    background: var(--md-surface-container-high);
    transform: scale(1.1);
    color: var(--md-primary);
  }

  .info-button:active {
    background: var(--md-surface-container-highest);
    transform: scale(0.85);
    transition-duration: 0.06s;
  }

  .app-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px 24px 28px;
    font-size: 13px;
    color: var(--md-on-surface-variant);
    animation: footerFadeIn var(--md-duration-long) var(--md-easing-emphasized-decel) 0.4s both;
  }

  .about-description {
    text-align: center;
    font-size: 13px;
    line-height: 1.5;
    color: var(--md-on-surface-variant);
    opacity: 0.8;
    max-width: 320px;
  }

  .about-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .about-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border: 1px solid var(--md-outline-variant);
    border-radius: var(--md-shape-full);
    background: transparent;
    color: var(--md-primary);
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
    transition: all 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    position: relative;
    overflow: hidden;
  }

  .about-link::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--md-primary);
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
    border-radius: inherit;
  }

  .about-link:hover::before {
    opacity: 0.08;
  }

  .about-link:hover {
    background: var(--md-primary-container);
    transform: translateY(-3px) scale(1.04);
    box-shadow: 0 4px 12px rgba(91, 80, 145, 0.2);
    border-color: var(--md-primary-container);
    text-decoration: none;
  }

  .about-link:hover svg {
    transform: scale(1.15);
  }

  .about-link svg {
    transition: transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    flex-shrink: 0;
  }

  .about-link:active {
    transform: scale(0.92);
    transition-duration: 0.06s;
    box-shadow: none;
  }

  .about-creator {
    font-size: 12px;
    color: var(--md-on-surface-variant);
    opacity: 0.7;
  }

  .about-creator a {
    color: var(--md-primary);
    text-decoration: none;
    font-weight: 500;
    transition: color 0.15s ease;
  }

  .about-creator a:hover {
    text-decoration: underline;
    color: var(--md-on-surface);
  }

  .app-footer .footer-link {
    font-size: 11px;
    color: var(--md-on-surface-variant);
    text-decoration: none;
    opacity: 0.5;
    transition: all 0.15s ease;
  }

  .app-footer .footer-link:hover {
    opacity: 0.8;
    text-decoration: underline;
    transform: scale(1.05);
  }

  .app-footer .footer-link:active {
    transform: scale(0.95);
  }

  /* --- Export / Import --- */

  .data-section {
    padding: 8px 12px 10px;
  }

  .data-group {
    padding: 6px 0;
  }

  .data-group-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: var(--md-on-surface-variant);
    opacity: 0.6;
    margin-bottom: 6px;
  }

  .data-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .data-divider {
    height: 1px;
    background: var(--md-outline-variant);
    opacity: 0.4;
    margin: 4px 0;
  }

  .action-btn {
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    padding: 5px 12px;
    border: 1px solid var(--md-outline-variant);
    border-radius: var(--md-shape-full);
    background: transparent;
    color: var(--md-primary);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    position: relative;
    overflow: hidden;
  }

  .action-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--md-primary);
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
    border-radius: inherit;
  }

  .action-btn:hover::after {
    opacity: 0.06;
  }

  .action-btn:hover {
    background: var(--md-primary-container);
    transform: translateY(-2px) scale(1.04);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border-color: var(--md-primary-container);
  }

  .action-btn:active {
    transform: scale(0.91);
    box-shadow: none;
    transition-duration: 0.06s;
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

  /* --- Custom Profiles --- */

  .custom-profile-chip {
    display: inline-flex;
    align-items: center;
    position: relative;
    animation: chipEnter var(--md-duration-short) var(--md-easing-emphasized-decel) both;
  }

  @keyframes chipEnter {
    from { opacity: 0; transform: scale(0.85); }
    to { opacity: 1; transform: scale(1); }
  }

  .custom-profile-chip .effect-option {
    padding-right: 24px;
  }

  .profile-rename-input {
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    padding: 5px 10px;
    border: 2px solid var(--md-primary);
    border-radius: var(--md-shape-full);
    background: var(--md-surface-container);
    color: var(--md-on-surface);
    outline: none;
    min-width: 60px;
    max-width: 120px;
    animation: inputPop 0.15s cubic-bezier(0.18, 0.89, 0.32, 1.28) both;
  }

  @keyframes inputPop {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
  }

  .custom-profile-delete {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    border-radius: var(--md-shape-full);
    background: transparent;
    color: var(--md-on-surface-variant);
    cursor: pointer;
    opacity: 0.5;
    transition: all var(--md-duration-short) var(--md-easing-standard);
  }

  .custom-profile-delete:hover {
    opacity: 1;
    color: var(--md-error);
    transform: translateY(-50%) scale(1.2);
  }

  .custom-profile-delete:active {
    transform: translateY(-50%) scale(0.8);
    transition-duration: 0.06s;
  }

  .profile-add-trigger {
    padding: 0 10px 8px;
  }

  .profile-add-card {
    margin: 4px 10px 8px;
    padding: 10px;
    background: var(--md-surface-container-low);
    border-radius: var(--md-shape-md);
    border: 1px solid var(--md-outline-variant);
    animation: feedbackSlideIn var(--md-duration-short) var(--md-easing-emphasized-decel) both;
  }

  .profile-add-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }

  .profile-add-cancel {
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5px 8px !important;
    color: var(--md-on-surface-variant) !important;
    border-color: transparent !important;
  }

  .profile-add-cancel:hover {
    background: var(--md-surface-container-high) !important;
  }

  .profile-name-input {
    width: 100%;
    font-size: 13px;
    font-family: inherit;
    padding: 8px 12px;
    border: 1px solid var(--md-outline-variant);
    border-radius: var(--md-shape-sm);
    background: var(--md-surface-container);
    color: var(--md-on-surface);
    outline: none;
    transition: border-color var(--md-duration-short) var(--md-easing-standard);
  }

  .profile-name-input:focus {
    border-color: var(--md-primary);
    border-width: 2px;
    padding: 7px 11px;
  }

  .profile-name-input::placeholder {
    color: var(--md-outline);
  }

  /* --- Reset Confirmation --- */

  .reset-confirm {
    margin: 8px 0 4px;
    padding: 16px;
    border-radius: var(--md-shape-lg);
    background: var(--md-surface-container-high);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08);
    animation: feedbackSlideIn var(--md-duration-short) var(--md-easing-emphasized-decel) both;
  }

  .reset-confirm-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--md-on-surface);
    margin-bottom: 8px;
  }

  .reset-confirm-message {
    font-size: 13px;
    color: var(--md-on-surface-variant);
    margin-bottom: 16px;
    line-height: 1.5;
  }

  .reset-confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .action-btn-danger {
    color: var(--md-error);
    border-color: var(--md-error);
  }

  .action-btn-danger:hover {
    background: rgba(186, 26, 26, 0.08);
    transform: translateY(-1px) scale(1.02);
    box-shadow: 0 2px 6px rgba(186, 26, 26, 0.15);
  }

  .action-btn-danger:active {
    transform: scale(0.93);
    box-shadow: none;
    transition-duration: 0.06s;
  }

  @media (prefers-color-scheme: dark) {
    .action-btn-danger:hover {
      background: rgba(255, 180, 171, 0.08);
    }
  }

</style>
