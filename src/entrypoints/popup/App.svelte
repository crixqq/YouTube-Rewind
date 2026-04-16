<script lang="ts">
  import { DEFAULT_SETTINGS, loadSettings, saveSettings, PROFILES, clearWatchTimeState, type Settings, type CustomProfile } from '@/lib/settings';
  import { createProfileExportPayload, createSettingsExportPayload, parseSettingsTransfer, stringifySettingsTransfer } from '@/lib/settings-transfer';
  import { t, setLocale, allTranslations } from '@/lib/i18n';
  import SettingsSection from '@/components/SettingsSection.svelte';
  import Toggle from '@/components/Toggle.svelte';
  import Slider from '@/components/Slider.svelte';
  import ShapePicker from '@/components/ShapePicker.svelte';
  import ChipGroup from '@/components/ChipGroup.svelte';
  import ColorPicker from '@/components/ColorPicker.svelte';

  const urlParams = new URLSearchParams(window.location.search);
  const isStandaloneView = urlParams.get('view') === 'page';
  const MAX_LOGO_IMAGE_FILE_SIZE = 2 * 1024 * 1024;
  const MAX_LOGO_VIDEO_FILE_SIZE = 16 * 1024 * 1024;
  const LOGO_ACCEPT = 'image/png,image/jpeg,image/gif,image/svg+xml,image/webp,video/mp4,video/webm,video/ogg';
  const BUILTIN_REWIND_LOGO_URL = browser.runtime.getURL('logo-header.png');
  const LOGO_VARIANTS: Settings['logoVariant'][] = ['youtube', 'rewind', 'custom'];
  const THEME_PRESETS = [
    { id: 'default', label: 'themePresetDefault', dark: '#c8bfff', light: '#443795' },
    { id: 'twilight', label: 'themePresetTwilight', dark: '#9fb4ff', light: '#3554a5' },
    { id: 'mint', label: 'themePresetMint', dark: '#8bdcc7', light: '#2d6b5a' },
    { id: 'rose', label: 'themePresetRose', dark: '#f0bdd8', light: '#8d4569' },
    { id: 'ocean', label: 'themePresetOcean', dark: '#7ed8ff', light: '#155993' },
    { id: 'amber', label: 'themePresetAmber', dark: '#f3c98c', light: '#8d5b17' },
  ] as const;
  type ResolvedThemeMode = Exclude<Settings['interfaceThemeMode'], 'auto'>;

  let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  let loaded = $state(false);
  let langVersion = $state(0);
  let langMenuOpen = $state(false);

  // Search
  let searchQuery = $state('');
  let searchFocused = $state(false);

  // Export/Import
  type DataFeedback = '' | 'copied' | 'imported' | 'error' | 'profile' | 'reset';
  let dataFeedback = $state<DataFeedback>('');
  let feedbackTimeout: ReturnType<typeof setTimeout>;
  type SheetFeedback = { text: string; type: 'ok' | 'error' } | null;
  type SheetKind = '' | 'import' | 'profile-import' | 'logo';
  type SearchableFilter = { key: string; label: string; checked: boolean; onchange: (value: boolean) => void };
  let activeSheet = $state<SheetKind>('');
  let sheetFeedback = $state<SheetFeedback>(null);
  let sheetFeedbackTimeout: ReturnType<typeof setTimeout>;
  let betaConfirmOpen = $state(false);
  let logoAnimationConfirmOpen = $state(false);

  let importDragging = $state(false);
  let importPasting = $state(false);
  let pendingProfileText = $state('');
  let pendingProfileFileName = $state('');
  let sheetProfileNameInput = $state('');

  let logoDragging = $state(false);
  let logoPasting = $state(false);
  let logoDraftUrl = $state('');
  let systemPrefersDark = $state(true);
  type LogoScaleKey = 'youtubeLogoScale' | 'rewindLogoScale' | 'customLogoScale';
  let developerConfirmOpen = $state(false);
  let developerFeedback = $state<SheetFeedback>(null);
  let developerFeedbackTimeout: ReturnType<typeof setTimeout>;

  function formatPercent(value: number): string {
    return `${Math.round(value)}%`;
  }

  function parsePercent(text: string): number {
    const numeric = parseInt(text.replace('%', '').trim(), 10);
    return Number.isNaN(numeric) ? 100 : numeric;
  }

  function clampHue(value: number): number {
    return Math.min(360, Math.max(0, Math.round(value)));
  }

  function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  function normalizeThemeMode(mode: unknown): Settings['interfaceThemeMode'] {
    if (mode === 'light' || mode === 'dark') return mode;
    return 'auto';
  }

  function resolveThemeMode(mode: Settings['interfaceThemeMode'], prefersDark = systemPrefersDark): ResolvedThemeMode {
    if (mode === 'auto') return prefersDark ? 'dark' : 'light';
    return mode;
  }

  function getOppositeThemeMode(mode: ResolvedThemeMode): ResolvedThemeMode {
    return mode === 'dark' ? 'light' : 'dark';
  }

  function hslColor(hue: number, saturation: number, lightness: number): string {
    return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
  }

  function clampPercent(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function hexFromHsl(hue: number, saturation: number, lightness: number): string {
    const h = ((hue % 360) + 360) % 360 / 360;
    const s = Math.min(1, Math.max(0, saturation / 100));
    const l = Math.min(1, Math.max(0, lightness / 100));

    if (s === 0) {
      const gray = Math.round(l * 255);
      return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
    }

    const hueToRgb = (p: number, q: number, t: number): number => {
      let next = t;
      if (next < 0) next += 1;
      if (next > 1) next -= 1;
      if (next < 1 / 6) return p + (q - p) * 6 * next;
      if (next < 1 / 2) return q;
      if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = Math.round(hueToRgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hueToRgb(p, q, h) * 255);
    const b = Math.round(hueToRgb(p, q, h - 1 / 3) * 255);
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  function hexFromRgb(r: number, g: number, b: number): string {
    return `#${[r, g, b].map((channel) => Math.min(255, Math.max(0, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`;
  }

  function rgbToHue(r: number, g: number, b: number, fallbackHue = DEFAULT_SETTINGS.interfaceThemeHue): number {
    const red = clamp01(r / 255);
    const green = clamp01(g / 255);
    const blue = clamp01(b / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;

    if (delta < 0.01) return clampHue(fallbackHue);

    let hue = 0;
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }

    return clampHue(hue * 60);
  }

  function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const red = clamp01(r / 255);
    const green = clamp01(g / 255);
    const blue = clamp01(b / 255);
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

  function parseHexColor(value: string): [number, number, number] | null {
    const normalized = value.trim().toLowerCase();
    const match = normalized.match(/^#([0-9a-f]{6})$/i);
    if (!match) return null;
    return [
      Number.parseInt(normalized.slice(1, 3), 16),
      Number.parseInt(normalized.slice(3, 5), 16),
      Number.parseInt(normalized.slice(5, 7), 16),
    ];
  }

  function parseRgbChannels(value: string): [number, number, number] | null {
    const match = value.match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part.trim()));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
    return [
      Math.min(255, Math.max(0, Math.round(parts[0]))),
      Math.min(255, Math.max(0, Math.round(parts[1]))),
      Math.min(255, Math.max(0, Math.round(parts[2]))),
    ];
  }

  function mixHexColors(first: string, second: string, ratio = 0.5): string {
    const a = parseHexColor(first);
    const b = parseHexColor(second);
    if (!a || !b) return first;
    const weight = clamp01(ratio);
    return hexFromRgb(
      a[0] * weight + b[0] * (1 - weight),
      a[1] * weight + b[1] * (1 - weight),
      a[2] * weight + b[2] * (1 - weight),
    );
  }

  function getSeedThemeColor(value: string | undefined = settings.interfaceThemeColor): string {
    return parseHexColor(value || '') ? value!.toLowerCase() : DEFAULT_SETTINGS.interfaceThemeColor;
  }

  function buildThemeColorPatch(color: string, fallbackHue = settings.interfaceThemeHue): Pick<Settings, 'interfaceThemeColor' | 'interfaceThemeHue'> {
    const nextColor = getSeedThemeColor(color);
    const rgb = parseHexColor(nextColor) || parseHexColor(DEFAULT_SETTINGS.interfaceThemeColor)!;
    return {
      interfaceThemeColor: nextColor,
      interfaceThemeHue: rgbToHue(rgb[0], rgb[1], rgb[2], fallbackHue),
    };
  }

  function normalizeThemeSeedColor(color: string): string {
    const rgb = parseHexColor(color);
    if (!rgb) return DEFAULT_SETTINGS.interfaceThemeColor;
    const original = hexFromRgb(rgb[0], rgb[1], rgb[2]).toLowerCase();
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    if (hsl.s >= 0.06 && hsl.l >= 0.22 && hsl.l <= 0.92) {
      return original;
    }
    const saturation = hsl.s < 0.06 ? 0.08 : hsl.s;
    const lightness = clamp01(Math.min(0.92, Math.max(0.22, hsl.l)));
    return hexFromHsl(hsl.h, saturation * 100, lightness * 100);
  }

  function sanitizeThemeSeedColor(mode: ResolvedThemeMode, color: string): string {
    const rgb = parseHexColor(normalizeThemeSeedColor(color));
    if (!rgb) return DEFAULT_SETTINGS.interfaceThemeColor;
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const saturation = hsl.s < 0.08 ? 0.18 : hsl.s;
    const lightness = mode === 'dark'
      ? clamp01(Math.min(0.92, Math.max(0.58, hsl.l)))
      : clamp01(Math.min(0.9, Math.max(0.16, hsl.l)));

    return hexFromHsl(hsl.h, saturation * 100, lightness * 100);
  }

  function resolveThemeColorInput(value: string): { color: string; hue: number } | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const probe = document.createElement('span');
    probe.style.color = '';
    probe.style.color = trimmed;
    if (!probe.style.color) return null;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    const channels = parseRgbChannels(computed);
    if (!channels) return null;
    return {
      color: hexFromRgb(channels[0], channels[1], channels[2]),
      hue: rgbToHue(channels[0], channels[1], channels[2], settings.interfaceThemeHue),
    };
  }

  function getThemePrimaryColor(mode: ResolvedThemeMode, seedColor = getSeedThemeColor()): string {
    const [red, green, blue] = parseHexColor(seedColor) || parseHexColor(DEFAULT_SETTINGS.interfaceThemeColor)!;
    const { h, s } = rgbToHsl(red, green, blue);
    if (mode === 'light') {
      return hexFromHsl(h, clampPercent(s * 100 * 0.46, 34, 56), 40);
    }
    return sanitizeThemeSeedColor('dark', seedColor);
  }

  function getThemePresetColor(
    preset: typeof THEME_PRESETS[number],
    mode: ResolvedThemeMode = resolveThemeMode(settings.interfaceThemeMode),
  ): string {
    return (mode === 'light' ? preset.light : preset.dark).toLowerCase();
  }

  function findMatchingThemePreset(color: string, mode: ResolvedThemeMode): typeof THEME_PRESETS[number] | null {
    const normalizedColor = getSeedThemeColor(color);
    return THEME_PRESETS.find((preset) => getThemePresetColor(preset, mode) === normalizedColor) || null;
  }

  function getLinkedThemeColor(currentColor: string, sourceMode: ResolvedThemeMode, targetMode: ResolvedThemeMode): string {
    const preset = findMatchingThemePreset(currentColor, sourceMode);
    if (preset) return getThemePresetColor(preset, targetMode);
    return sanitizeThemeSeedColor(targetMode, currentColor);
  }

  function coerceThemeColorForMode(
    modeSetting: Settings['interfaceThemeMode'],
    targetMode: ResolvedThemeMode,
    currentColor: string,
  ): string {
    const normalizedColor = getSeedThemeColor(currentColor);
    if (findMatchingThemePreset(normalizedColor, targetMode)) {
      return normalizedColor;
    }

    const presetFromOppositeMode = findMatchingThemePreset(normalizedColor, getOppositeThemeMode(targetMode));
    if (presetFromOppositeMode) {
      return getThemePresetColor(presetFromOppositeMode, targetMode);
    }

    if (modeSetting === 'auto') {
      return sanitizeThemeSeedColor(targetMode, normalizedColor);
    }

    return normalizedColor;
  }

  function isThemePresetActive(preset: typeof THEME_PRESETS[number]): boolean {
    return getSeedThemeColor(settings.interfaceThemeColor) === getThemePresetColor(preset, resolveThemeMode(settings.interfaceThemeMode));
  }

  let themeColorPresets = $derived.by(() => {
    const presetColors = THEME_PRESETS.map((preset) => getThemePresetColor(preset, resolveThemeMode(settings.interfaceThemeMode)));
    return [...new Set([DEFAULT_SETTINGS.interfaceThemeColor, ...presetColors])];
  });

  function applyThemePreset(preset: typeof THEME_PRESETS[number]): void {
    const nextColor = getThemePresetColor(preset, resolveThemeMode(settings.interfaceThemeMode));
    void applySettingsPatch(buildThemeColorPatch(nextColor, settings.interfaceThemeHue));
  }

  function switchInterfaceThemeMode(nextMode: Settings['interfaceThemeMode']): void {
    const previousResolvedMode = resolveThemeMode(settings.interfaceThemeMode);
    const nextResolvedMode = resolveThemeMode(nextMode);
    const nextSettingsPatch: Partial<Settings> = { interfaceThemeMode: nextMode };

    if (previousResolvedMode !== nextResolvedMode) {
      const nextColor = getLinkedThemeColor(getSeedThemeColor(settings.interfaceThemeColor), previousResolvedMode, nextResolvedMode);
      Object.assign(nextSettingsPatch, buildThemeColorPatch(nextColor, settings.interfaceThemeHue));
    }

    void applySettingsPatch(nextSettingsPatch);
  }

  function buildInterfaceTheme(mode: ResolvedThemeMode, seedColor: string): Record<string, string> {
    const accentSeed = sanitizeThemeSeedColor(mode, seedColor);
    const [red, green, blue] = parseHexColor(accentSeed) || parseHexColor(DEFAULT_SETTINGS.interfaceThemeColor)!;
    const { h: accentHue, s: accentSaturation } = rgbToHsl(red, green, blue);
    const neutralHue = (accentHue + 8) % 360;
    const primary = getThemePrimaryColor(mode, accentSeed);
    const secondary = mode === 'light'
      ? hexFromHsl(accentHue, clampPercent(accentSaturation * 100 * 0.2, 12, 22), 46)
      : hexFromHsl(accentHue, clampPercent(accentSaturation * 100 * 0.2, 12, 24), 78);
    const primaryContainer = mode === 'light'
      ? hexFromHsl(accentHue, clampPercent(accentSaturation * 100 * 0.84, 62, 90), 89)
      : hexFromHsl(accentHue, clampPercent(accentSaturation * 100 * 0.5, 30, 58), 34);
    const secondaryContainer = mode === 'light'
      ? hexFromHsl(accentHue, clampPercent(accentSaturation * 100 * 0.26, 14, 30), 90)
      : hexFromHsl(accentHue, clampPercent(accentSaturation * 100 * 0.14, 10, 18), 31);
    const logoColor = mode === 'light'
      ? mixHexColors(primary, '#6a6675', 0.44)
      : mixHexColors(accentSeed, '#d7d3e5', 0.42);

    if (mode === 'light') {
      return {
        '--md-primary': primary,
        '--md-on-primary': '#ffffff',
        '--md-primary-container': primaryContainer,
        '--md-on-primary-container': hexFromHsl(accentHue, clampPercent(accentSaturation * 100 * 0.54, 42, 62), 18),
        '--md-secondary': secondary,
        '--md-on-secondary': '#ffffff',
        '--md-secondary-container': secondaryContainer,
        '--md-on-secondary-container': hexFromHsl(accentHue, clampPercent(accentSaturation * 100 * 0.34, 20, 38), 20),
        '--md-surface': hslColor(neutralHue, 18, 97),
        '--md-surface-dim': hslColor(neutralHue, 8, 86),
        '--md-surface-container-lowest': '#ffffff',
        '--md-surface-container-low': hslColor(neutralHue, 16, 95),
        '--md-surface-container': hslColor(neutralHue, 14, 92),
        '--md-surface-container-high': hslColor(neutralHue, 12, 89),
        '--md-surface-container-highest': hslColor(neutralHue, 10, 85),
        '--md-on-surface': hslColor(neutralHue, 10, 13),
        '--md-on-surface-variant': hslColor(neutralHue, 8, 32),
        '--md-outline': hslColor(neutralHue, 8, 50),
        '--md-outline-variant': hslColor(neutralHue, 12, 80),
        '--md-error': '#ba1a1a',
        '--ytr-logo-color': logoColor,
      };
    }

    return {
      '--md-primary': primary,
      '--md-on-primary': hexFromHsl(accentHue, clampPercent(accentSaturation * 100 * 0.42, 24, 48), 21),
      '--md-primary-container': primaryContainer,
      '--md-on-primary-container': '#ede7ff',
      '--md-secondary': secondary,
      '--md-on-secondary': '#2a2734',
      '--md-secondary-container': secondaryContainer,
      '--md-on-secondary-container': '#eee9f7',
      '--md-surface': hslColor(neutralHue, 12, 10),
      '--md-surface-dim': hslColor(neutralHue, 10, 9),
      '--md-surface-container-lowest': hslColor(neutralHue, 10, 7),
      '--md-surface-container-low': hslColor(neutralHue, 9, 12),
      '--md-surface-container': hslColor(neutralHue, 8, 14),
      '--md-surface-container-high': hslColor(neutralHue, 8, 18),
      '--md-surface-container-highest': hslColor(neutralHue, 7, 22),
      '--md-on-surface': hslColor(neutralHue, 10, 91),
      '--md-on-surface-variant': hslColor(neutralHue, 8, 76),
      '--md-outline': hslColor(neutralHue, 8, 58),
      '--md-outline-variant': hslColor(neutralHue, 7, 24),
      '--md-error': '#ffb4ab',
      '--ytr-logo-color': logoColor,
    };
  }

  function applyInterfaceTheme(mode: ResolvedThemeMode, seedColor: string): void {
    if (typeof document === 'undefined' || !document.body) return;
    const tokens = buildInterfaceTheme(mode, getSeedThemeColor(seedColor));
    const root = document.documentElement;
    for (const [token, value] of Object.entries(tokens)) {
      root.style.setProperty(token, value);
    }
    document.body.dataset.ytrThemeMode = mode;
  }

  function getInterfaceThemePrimaryHex(mode: ResolvedThemeMode, seedColor: string): string {
    return getThemePrimaryColor(mode, getSeedThemeColor(seedColor));
  }

  function formatThemeHue(value: number): string {
    const currentSeed = getSeedThemeColor(settings.interfaceThemeColor);
    const [red, green, blue] = parseHexColor(currentSeed) || parseHexColor(DEFAULT_SETTINGS.interfaceThemeColor)!;
    const { s, l } = rgbToHsl(red, green, blue);
    return hexFromHsl(value, s * 100, l * 100);
  }

  function commitInterfaceThemeColor(value: string): void {
    const next = resolveThemeColorInput(value);
    if (next === null) return;
    const normalizedColor = sanitizeThemeSeedColor(resolveThemeMode(settings.interfaceThemeMode), next.color);
    void applySettingsPatch(buildThemeColorPatch(normalizedColor, next.hue));
  }

  function resetInterfaceThemePalette(): void {
    const nextColor = getThemePresetColor(THEME_PRESETS[0], resolveThemeMode(settings.interfaceThemeMode));
    void applySettingsPatch(buildThemeColorPatch(nextColor, DEFAULT_SETTINGS.interfaceThemeHue));
  }

  function updateInterfaceThemeHue(value: number): void {
    const nextHue = clampHue(value);
    const currentSeed = getSeedThemeColor(settings.interfaceThemeColor);
    const [red, green, blue] = parseHexColor(currentSeed) || parseHexColor(DEFAULT_SETTINGS.interfaceThemeColor)!;
    const { s, l } = rgbToHsl(red, green, blue);
    const nextSeed = sanitizeThemeSeedColor(resolveThemeMode(settings.interfaceThemeMode), hexFromHsl(nextHue, s * 100, l * 100));
    void applySettingsPatch(buildThemeColorPatch(nextSeed, nextHue));
  }

  // Update checker
  type UpdateState = 'idle' | 'checking' | 'available' | 'up-to-date' | 'error';
  let updateState = $state<UpdateState>('idle');
  let latestVersion = $state('');
  let releaseUrl = $state('');
  let updateMenuOpen = $state(false);

  const CACHE_KEY = 'ytr_update_cache';
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour
  const AMO_API_URL = 'https://addons.mozilla.org/api/v5/addons/addon/youtube-rewind/';

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

  function isVideoLogo(src: string): boolean {
    return /^data:video\//i.test(src) || /\.(mp4|webm|ogg|mov)(?:$|[?#])/i.test(src);
  }

  function normalizeLogoVariant(value: unknown): Settings['logoVariant'] {
    return value === 'youtube' || value === 'rewind' || value === 'custom'
      ? value
      : DEFAULT_SETTINGS.logoVariant;
  }

  function clampLogoScale(value: number, fallback: number): number {
    const nextValue = Number.isFinite(value) ? value : fallback;
    return Math.min(220, Math.max(40, Math.round(nextValue)));
  }

  function getLogoScaleKey(variant: Settings['logoVariant']): LogoScaleKey {
    if (variant === 'rewind') return 'rewindLogoScale';
    if (variant === 'custom') return 'customLogoScale';
    return 'youtubeLogoScale';
  }

  function getLogoScaleValue(source: Pick<Settings, LogoScaleKey>, variant: Settings['logoVariant']): number {
    return source[getLogoScaleKey(variant)];
  }

  function updateLogoScale(variant: Settings['logoVariant'], value: number): void {
    update(getLogoScaleKey(variant), value as Settings[LogoScaleKey]);
  }

  function getLogoScaleResetValue(variant: Settings['logoVariant']): number {
    if (variant === 'rewind') return DEFAULT_SETTINGS.rewindLogoScale;
    if (variant === 'custom') return DEFAULT_SETTINGS.customLogoScale;
    return DEFAULT_SETTINGS.youtubeLogoScale;
  }

  function resetLogoScale(variant: Settings['logoVariant']): void {
    updateLogoScale(variant, getLogoScaleResetValue(variant));
  }

  function getEffectiveLogoSource(variant: Settings['logoVariant'], customLogo: string): string {
    if (variant === 'rewind') return BUILTIN_REWIND_LOGO_URL;
    if (variant === 'custom' && customLogo) return customLogo;
    return '';
  }

  function getLogoPresetLabel(variant: Settings['logoVariant']): string {
    if (variant === 'youtube') return t('logoPresetYoutube');
    if (variant === 'custom') return t('logoPresetUploaded');
    return t('logoPresetRewind');
  }

  const AMO_URL = 'https://addons.mozilla.org/firefox/addon/youtube-rewind/';
  const isFirefox = browser.runtime.getURL('').startsWith('moz-extension://');

  async function fetchLatestVersionInfo(): Promise<{ version: string; url: string; source: 'amo' | 'github' }> {
    if (isFirefox) {
      const res = await fetch(AMO_API_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const version = (data?.current_version?.version || '').replace(/^v/, '');
      if (!version) throw new Error('Missing AMO version');
      return {
        version,
        url: AMO_URL,
        source: 'amo',
      };
    }

    const res = await fetch('https://api.github.com/repos/crixqq/YouTube-Rewind/releases/latest');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const version = (data.tag_name || '').replace(/^v/, '');
    if (!version) throw new Error('Missing GitHub version');
    return {
      version,
      url: data.html_url || 'https://github.com/crixqq/YouTube-Rewind/releases',
      source: 'github',
    };
  }

  async function checkForUpdates() {
    const currentVersion = browser.runtime.getManifest().version;
    const source = isFirefox ? 'amo' : 'github';

    // Check cache first
    try {
      const cached = await browser.storage.local.get(CACHE_KEY);
      const cache = cached[CACHE_KEY];
      if (cache && cache.source === source && Date.now() - cache.timestamp < CACHE_TTL) {
        latestVersion = cache.version;
        releaseUrl = cache.url;
        updateState = isNewer(cache.version, currentVersion) ? 'available' : 'up-to-date';
        return;
      }
    } catch {}

    updateState = 'checking';

    try {
      const { version, url, source: cacheSource } = await fetchLatestVersionInfo();

      latestVersion = version;
      releaseUrl = url;
      updateState = isNewer(version, currentVersion) ? 'available' : 'up-to-date';

      // Cache result
      await browser.storage.local.set({
        [CACHE_KEY]: { version, url, source: cacheSource, timestamp: Date.now() },
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
    { id: 'it', label: 'Italiano' },
    { id: 'pl', label: 'Polski' },
    { id: 'nl', label: 'Nederlands' },
    { id: 'ja', label: '日本語' },
    { id: 'ko', label: '한국어' },
    { id: 'zh', label: '中文' },
  ] as const;

  const SEARCH_ALIASES: Record<string, string[]> = {
    sectionProfiles: ['profile', 'profiles', 'preset', 'presets', 'профиль', 'профили', 'пресет', 'пресеты'],
    sectionPlayer: ['player', 'playback', 'speed', 'quality', 'download', 'плеер', 'скорость', 'качество', 'скачивание'],
    sectionWatchPage: ['watch page', 'video page', 'action buttons', 'buttons under video', 'страница видео', 'кнопки под видео'],
    sectionWatchTimer: ['watch timer', 'daily limit', 'screen time', 'timeout', 'таймер', 'лимит времени', 'ограничение времени'],
    sectionHomepageFilter: ['home', 'homepage', 'feed', 'recommendations', 'главная', 'лента', 'рекомендации'],
    sectionSearchFilter: ['search', 'search page', 'search results', 'поиск', 'результаты поиска'],
    sectionTopBar: ['top bar', 'header', 'masthead', 'logo', 'branding', 'верхняя панель', 'шапка', 'логотип'],
    sectionSidebarFilter: ['sidebar', 'guide', 'left menu', 'боковая панель', 'левое меню'],
    sectionThumbnailEffect: ['thumbnail', 'preview image', 'cover', 'миниатюра', 'превью', 'обложка'],
    sectionAvatarShape: ['avatar', 'channel icon', 'profile picture', 'аватар', 'иконка канала', 'форма'],
    sectionDeveloper: ['developer', 'debug', 'diagnostics', 'import', 'export', 'copy', 'paste', 'reset', 'reload', 'cache', 'developer tools', 'разработчик', 'отладка', 'диагностика', 'импорт', 'экспорт', 'копировать', 'вставить', 'сброс', 'перезагрузка', 'кэш'],
    sectionInterface: ['interface', 'theme', 'appearance', 'ui color', 'accent color', 'интерфейс', 'тема', 'цвет темы', 'цвет интерфейса'],
    sectionBeta: ['beta', 'experimental', 'labs', 'preview features', 'бета', 'экспериментальные функции'],
    settingDeveloperEnabled: ['developer tools', 'developer mode', 'debug tools', 'режим разработчика', 'инструменты разработчика'],
    settingCustomLogo: ['logo', 'branding', 'channel mark', 'логотип'],
    settingLogoVariant: ['logo preset', 'logo variant', 'default logo', 'rewind logo', 'вариант логотипа', 'пресет логотипа', 'дефолтный логотип'],
    settingCustomLogoSize: ['logo size', 'logo scale', 'размер логотипа', 'масштаб логотипа'],
    settingInterfaceThemeMode: ['theme mode', 'auto theme', 'system theme', 'dark theme', 'light theme', 'режим темы', 'авто тема', 'системная тема', 'темная тема', 'светлая тема'],
    settingInterfaceThemePresets: ['theme presets', 'preset colors', 'theme palette', 'цветовые пресеты', 'пресеты темы', 'палитра темы'],
    settingInterfaceThemeColor: ['theme color', 'accent color', 'hue', 'цвет темы', 'акцент', 'тон'],
    settingInterfaceThemeCustomColor: ['custom color', 'hex color', 'свой цвет', 'hex'],
    settingInterfaceThemeReset: ['reset palette', 'default palette', 'сброс палитры'],
    settingDefaultQuality: ['default quality', 'preferred quality', 'video quality', 'качество по умолчанию', 'предпочитаемое качество', 'качество видео'],
    settingHideLogoAnimation: ['logo motion', 'logo animation', 'event logo', 'event logo variants', 'анимация логотипа', 'ивентовые версии'],
    settingDisableThumbnailPreview: ['hover preview', 'preview on hover', 'moving thumbnail', 'thumbnail preview', 'предпросмотр при наведении', 'двигающееся превью'],
    settingVideosPerRow: ['grid', 'columns', 'videos per line', 'сетка', 'колонки', 'видео в ряд'],
    settingWatchTimeLimit: ['limit', 'daily limit', 'screen time', 'лимит', 'ограничение'],
    settingWatchTimerEnabled: ['watch timer', 'time counter', 'таймер', 'счетчик времени'],
    settingBetaHomepageRevealAnimation: ['feed animation', 'home animation', 'card reveal', 'анимация ленты', 'анимация карточек'],
    settingBetaVideoFrameScreenshot: ['screenshot', 'frame capture', 'video frame', 'скриншот', 'кадр видео'],
    settingBetaScreenshotInstantDownload: ['instant screenshot download', 'download screenshot immediately', 'скачивать скриншот сразу', 'моментальное скачивание скриншота'],
    hideJoinButton: ['join', 'membership', 'sponsor', 'спонсировать'],
    hideSubscribeButton: ['subscribe', 'подписаться', 'подписка'],
    hideLikeDislike: ['like', 'dislike', 'лайк', 'дизлайк'],
    hideShareButton: ['share', 'поделиться'],
    hideDownloadButton: ['download', 'скачать'],
    hideClipButton: ['clip', 'remix', 'клип', 'ремикс'],
    hideThanksButton: ['thanks', 'super thanks', 'спасибо'],
    hideSaveButton: ['save', 'playlist', 'сохранить'],
    hideShorts: ['shorts', 'reels', 'шортс', 'короткие видео'],
    hidePosts: ['posts', 'community', 'посты', 'сообщество'],
    hideMixes: ['mixes', 'playlist mixes', 'миксы'],
    hideBreakingNews: ['breaking news', 'news shelf', 'срочные новости', 'новости'],
    hideLatestPosts: ['latest posts', 'new posts', 'свежие посты'],
    hideExploreTopics: ['explore topics', 'topics', 'темы'],
    hidePlayables: ['playables', 'games', 'игры'],
    hideFilterBar: ['chip bar', 'filter chips', 'фильтры', 'фильтр бар'],
    disableAvatarLiveRedirect: ['avatar live redirect', 'live avatar', 'аватар стрима', 'редирект с аватара'],
    hideSearchShorts: ['shorts in search', 'шортс в поиске'],
    hideSearchChannels: ['channels in search', 'каналы в поиске'],
    hideSearchPeopleWatched: ['people watched', 'watched also', 'смотрели также'],
    hideTopbarCreate: ['create button', 'upload button', 'кнопка создать'],
    hideTopbarVoiceSearch: ['voice search', 'голосовой поиск'],
    hideTopbarNotifications: ['notifications', 'bell', 'уведомления'],
    hideTopbarSearch: ['search bar', 'поисковая строка'],
    hideCountryCode: ['country code', 'код страны'],
    hideSidebarSubscriptions: ['subscriptions', 'подписки'],
    hideSidebarYou: ['you section', 'ваше'],
    hideSidebarExplore: ['explore section', 'интересное'],
    hideSidebarMoreFromYT: ['more from youtube', 'ещё от youtube'],
    hideSidebarReportHistory: ['report history', 'история жалоб'],
    hideSidebarFooter: ['sidebar footer', 'footer', 'подвал'],
  };

  function capitalizeLabel(value: string): string {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getLanguageDisplayName(langId: string, includeLocalized = true): string {
    if (langId === 'auto') return t('langAuto');
    const native = LANGUAGES.find((lang) => lang.id === langId)?.label ?? langId;
    if (!includeLocalized) return native;

    const localized = getLanguageLocalizedLabel(langId);
    if (!localized) return native;
    return `${native} (${localized})`;
  }

  function getLanguageLocalizedLabel(langId: string): string {
    if (langId === 'auto') return '';
    try {
      const displayLocale = settings.language === 'auto'
        ? browser.i18n.getUILanguage()
        : settings.language;
      const displayNames = new Intl.DisplayNames([displayLocale], { type: 'language' });
      const translated = capitalizeLabel(displayNames.of(langId) || '');
      const native = LANGUAGES.find((lang) => lang.id === langId)?.label ?? langId;
      if (!translated || translated.toLowerCase() === native.toLowerCase()) return '';
      return translated;
    } catch {
      return '';
    }
  }

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

  const PROFILE_BETA_KEYS: (keyof Settings)[] = [
    'betaEnabled',
    'disableAvatarLiveRedirect',
    'betaHomepageRevealAnimation',
    'defaultQuality',
  ];

  function normalizeLocalSettings(next: Settings): Settings {
    const normalized = cloneSettings(next);
    normalized.youtubeLogoScale = clampLogoScale(normalized.youtubeLogoScale, DEFAULT_SETTINGS.youtubeLogoScale);
    normalized.rewindLogoScale = clampLogoScale(normalized.rewindLogoScale, DEFAULT_SETTINGS.rewindLogoScale);
    normalized.customLogoScale = clampLogoScale(normalized.customLogoScale, DEFAULT_SETTINGS.customLogoScale);
    normalized.betaStandalonePage = true;
    normalized.logoVariant = normalizeLogoVariant(normalized.logoVariant);
    normalized.interfaceThemeMode = normalizeThemeMode(normalized.interfaceThemeMode);
    normalized.interfaceThemeHue = clampHue(normalized.interfaceThemeHue ?? DEFAULT_SETTINGS.interfaceThemeHue);
    normalized.interfaceThemeColor = getSeedThemeColor(normalized.interfaceThemeColor);
    normalized.developerEnabled = Boolean(normalized.developerEnabled);
    if (!normalized.betaEnabled) {
      normalized.disableAvatarLiveRedirect = false;
      normalized.betaHomepageRevealAnimation = false;
      normalized.defaultQuality = 'auto';
    }
    if (!normalized.betaVideoFrameScreenshot) {
      normalized.betaScreenshotInstantDownload = false;
    }
    return normalized;
  }

  function extractProfileSettings(source: Partial<Settings>): Partial<Settings> {
    const profileSettings = { ...source };
    delete (profileSettings as any).language;
    delete (profileSettings as any).customProfiles;
    delete (profileSettings as any).activeProfile;
    delete (profileSettings as any).developerEnabled;
    delete (profileSettings as any).betaStandalonePage;
    return profileSettings;
  }

  function profileHasStoredBetaSettings(profileSettings: Partial<Settings>): boolean {
    return PROFILE_BETA_KEYS.some((key) => key in profileSettings);
  }

  function resolveAppliedProfileSettings(profileSettingsInput: Partial<Settings>): Partial<Settings> {
    const profileSettings = extractProfileSettings(profileSettingsInput);
    if (profileHasStoredBetaSettings(profileSettings)) {
      return profileSettings;
    }
    return {
      ...profileSettings,
      betaEnabled: settings.betaEnabled,
      disableAvatarLiveRedirect: settings.disableAvatarLiveRedirect,
      betaHomepageRevealAnimation: settings.betaHomepageRevealAnimation,
    };
  }

  const PROFILE_LOGO_KEYS: Array<
    'logoVariant' |
    'customLogo' |
    'customLogoRatio' |
    'youtubeLogoScale' |
    'rewindLogoScale' |
    'customLogoScale' |
    'hideLogoAnimation'
  > = [
    'logoVariant',
    'customLogo',
    'customLogoRatio',
    'youtubeLogoScale',
    'rewindLogoScale',
    'customLogoScale',
    'hideLogoAnimation',
  ];

  function stripLogoDefaults(resetData: Partial<Settings>, profileSettings?: Partial<Settings>): void {
    for (const key of PROFILE_LOGO_KEYS) {
      if (!profileSettings || !(key in profileSettings)) {
        delete (resetData as any)[key];
      }
    }
  }

  function pickSettingsKeys(source: Partial<Settings>, keys: readonly (keyof Settings)[]): Record<string, unknown> {
    const picked: Record<string, unknown> = {};
    for (const key of keys) {
      picked[key as string] = source[key];
    }
    return picked;
  }

  function computeProfileModifiedState(nextSettings: Settings): boolean {
    const activeId = nextSettings.activeProfile;
    if (!activeId || activeId === 'none') return false;

    if (activeId.startsWith('custom:')) {
      const profileName = activeId.slice(7);
      const profile = (nextSettings.customProfiles || []).find((entry) => entry.name === profileName);
      if (!profile) return false;

      const baseline = normalizeLocalSettings({
        ...DEFAULT_SETTINGS,
        ...resolveAppliedProfileSettings(profile.settings),
        activeProfile: activeId,
        language: nextSettings.language,
        customProfiles: cloneCustomProfiles(nextSettings.customProfiles || []),
      });

      return JSON.stringify(extractProfileSettings(nextSettings)) !== JSON.stringify(extractProfileSettings(baseline));
    }

    const profile = PROFILES[activeId];
    if (!profile) return false;

    const profileKeys = Object.keys(profile) as (keyof Settings)[];
    const baseline = { ...DEFAULT_SETTINGS, ...profile };
    return JSON.stringify(pickSettingsKeys(nextSettings, profileKeys)) !== JSON.stringify(pickSettingsKeys(baseline, profileKeys));
  }

  function syncProfileModifiedState(nextSettings: Settings = settings): void {
    profileModified = computeProfileModifiedState(nextSettings);
  }

  function settingsEqual(a: Settings, b: Settings): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function getBuiltinProfileLabel(profileId: string): string {
    const option = PROFILE_OPTIONS.find((profile) => profile.id === profileId);
    return option ? t(option.label) : profileId;
  }

  function createUniqueCustomProfileName(baseName: string): string {
    const trimmed = baseName.trim() || 'Custom';
    const existing = new Set((settings.customProfiles || []).map((profile) => profile.name));
    if (!existing.has(trimmed)) return trimmed;
    let suffix = 2;
    while (existing.has(`${trimmed} ${suffix}`)) {
      suffix++;
    }
    return `${trimmed} ${suffix}`;
  }

  function shouldDetachBuiltinProfile(partial: Partial<Settings>): boolean {
    const activeId = settings.activeProfile;
    if (!activeId || activeId === 'none' || activeId.startsWith('custom:')) return false;
    if ('activeProfile' in partial || 'customProfiles' in partial) return false;
    return Object.keys(partial).length > 0;
  }

  function createDetachedBuiltinProfilePatch(partial: Partial<Settings>): Partial<Settings> {
    const activeId = settings.activeProfile;
    if (!activeId || activeId === 'none' || activeId.startsWith('custom:')) {
      return partial;
    }

    const name = createUniqueCustomProfileName(getBuiltinProfileLabel(activeId));
    const nextSettings = normalizeLocalSettings({
      ...settings,
      ...partial,
      activeProfile: `custom:${name}`,
      customProfiles: cloneCustomProfiles([
        ...(settings.customProfiles || []),
        {
          name,
          settings: extractProfileSettings({ ...settings, ...partial, activeProfile: `custom:${name}` }),
        },
      ]),
    });

    return {
      ...partial,
      activeProfile: nextSettings.activeProfile,
      customProfiles: nextSettings.customProfiles,
    };
  }

  function sanitizeFileNameSegment(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      || 'settings';
  }

  function getCurrentConfigName(source: Settings = settings): string {
    const activeId = source.activeProfile;
    if (!activeId || activeId === 'none') {
      return t('profileNone');
    }
    return activeId.startsWith('custom:')
      ? activeId.slice(7)
      : getBuiltinProfileLabel(activeId);
  }

  function buildExportFileName(ext: string): string {
    const configName = getCurrentConfigName();
    const normalizedName = sanitizeFileNameSegment(configName);
    if (!configName || normalizedName === sanitizeFileNameSegment(t('profileNone'))) {
      return `youtube-rewind-settings.${ext}`;
    }
    return `youtube-rewind-${normalizedName}-settings.${ext}`;
  }

  function buildProfileExportFileName(profileName: string, ext: string): string {
    const normalizedName = sanitizeFileNameSegment(profileName);
    return `youtube-rewind-profile-${normalizedName}.${ext}`;
  }

  function getActiveCustomProfile(): CustomProfile | null {
    const activeId = settings.activeProfile;
    if (!activeId || !activeId.startsWith('custom:')) return null;
    const profileName = activeId.slice(7);
    return (settings.customProfiles || []).find((profile) => profile.name === profileName) || null;
  }

  function patchLocalSettings(partial: Partial<Settings>): void {
    const previousLanguage = settings.language;
    settings = normalizeLocalSettings({
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
    syncProfileModifiedState(settings);
  }

  async function applySettingsPatch(partial: Partial<Settings>): Promise<void> {
    const nextPatch = shouldDetachBuiltinProfile(partial)
      ? createDetachedBuiltinProfilePatch(partial)
      : partial;
    patchLocalSettings(nextPatch);
    await saveSettings(nextPatch);
  }

  function showSheetFeedback(text: string, type: 'ok' | 'error' = 'ok') {
    sheetFeedback = { text, type };
    clearTimeout(sheetFeedbackTimeout);
    sheetFeedbackTimeout = setTimeout(() => { sheetFeedback = null; }, 2500);
  }

  function clearSheetState() {
    activeSheet = '';
    importDragging = false;
    importPasting = false;
    pendingProfileText = '';
    pendingProfileFileName = '';
    sheetProfileNameInput = '';
    logoDragging = false;
    logoPasting = false;
    logoDraftUrl = settings.customLogo;
    sheetFeedback = null;
  }

  $effect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      const previousResolvedMode = resolveThemeMode(settings.interfaceThemeMode, systemPrefersDark);
      const nextPrefersDark = event.matches;
      const nextResolvedMode = resolveThemeMode(settings.interfaceThemeMode, nextPrefersDark);
      systemPrefersDark = nextPrefersDark;

      if (!loaded || settings.interfaceThemeMode !== 'auto' || previousResolvedMode === nextResolvedMode) {
        return;
      }

      const nextColor = getLinkedThemeColor(getSeedThemeColor(settings.interfaceThemeColor), previousResolvedMode, nextResolvedMode);
      const themePatch = buildThemeColorPatch(nextColor, settings.interfaceThemeHue);
      patchLocalSettings(themePatch);
      void saveSettings(themePatch);
    };

    systemPrefersDark = media.matches;
    media.addEventListener('change', handleChange);
    return () => {
      media.removeEventListener('change', handleChange);
    };
  });

  // Init once on mount — no reactive deps, so $effect runs only once
  $effect(() => {
    loadSettings().then((s) => {
      const normalizedThemeMode = normalizeThemeMode(s.interfaceThemeMode);
      const resolvedMode = resolveThemeMode(normalizedThemeMode, systemPrefersDark);
      const coercedThemeColor = coerceThemeColorForMode(normalizedThemeMode, resolvedMode, s.interfaceThemeColor);
      const nextThemePatch: Partial<Settings> = {};

      if (normalizedThemeMode !== s.interfaceThemeMode) {
        nextThemePatch.interfaceThemeMode = normalizedThemeMode;
      }
      if (coercedThemeColor !== getSeedThemeColor(s.interfaceThemeColor)) {
        Object.assign(nextThemePatch, buildThemeColorPatch(coercedThemeColor, s.interfaceThemeHue));
      }

      settings = cloneSettings(normalizeLocalSettings({
        ...s,
        ...nextThemePatch,
      }));
      setLocale(settings.language);
      logoDraftUrl = settings.customLogo;
      syncProfileModifiedState(settings);
      loaded = true;
      checkForUpdates();

      if (Object.keys(nextThemePatch).length > 0) {
        void saveSettings(nextThemePatch);
      }
    });
  });

  $effect(() => {
    document.body.dataset.ytrLayout = isStandaloneView ? 'page' : 'popup';
    return () => {
      delete document.body.dataset.ytrLayout;
    };
  });

  $effect(() => {
    applyInterfaceTheme(resolveThemeMode(settings.interfaceThemeMode), settings.interfaceThemeColor);
    return () => {
      if (typeof document !== 'undefined' && document.body) {
        delete document.body.dataset.ytrThemeMode;
      }
    };
  });

  $effect(() => {
    if (!isStandaloneView) return;

    const handleStorageChange = (changes: Record<string, browser.storage.StorageChange>) => {
      if (!changes.ytr_settings?.newValue) return;
      const next = cloneSettings(changes.ytr_settings.newValue as Settings);
      if (settingsEqual(next, settings)) return;
      const previousLanguage = settings.language;
      settings = next;
      if (next.language !== previousLanguage) {
        setLocale(next.language);
        langVersion++;
      }
      syncProfileModifiedState(next);
      if (!next.betaEnabled) {
        betaConfirmOpen = false;
        if (activeSheet) clearSheetState();
      }
      if (!next.developerEnabled) {
        developerConfirmOpen = false;
        developerFeedback = null;
        showResetConfirm = false;
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  });

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    void applySettingsPatch({ [key]: value } as Pick<Settings, K>);
  }

  function saveChangesToProfile() {
    const activeId = settings.activeProfile;
    if (!activeId || activeId === 'none') return;

    if (activeId.startsWith('custom:')) {
      const name = activeId.slice(7);
      const profiles = [...(settings.customProfiles || [])];
      const idx = profiles.findIndex((p) => p.name === name);
      if (idx >= 0) {
        const profileSettings = extractProfileSettings(settings);
        profiles[idx] = { ...profiles[idx], settings: profileSettings };
        const nextProfiles = cloneCustomProfiles(profiles);
        patchLocalSettings({ customProfiles: nextProfiles });
        void saveSettings({ customProfiles: nextProfiles });
      }
    } else {
      const name = createUniqueCustomProfileName(getBuiltinProfileLabel(activeId));
      const profileSettings = extractProfileSettings(settings);
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
    showFeedback('profile');
  }

  function normalizeSearchText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ё/g, 'е')
      .replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenizeSearchText(value: string): string[] {
    return normalizeSearchText(value).split(' ').filter(Boolean);
  }

  function isSubsequenceMatch(query: string, candidate: string): boolean {
    let queryIndex = 0;
    for (const char of candidate) {
      if (char === query[queryIndex]) queryIndex += 1;
      if (queryIndex >= query.length) return true;
    }
    return false;
  }

  function isEditDistanceWithin(query: string, candidate: string, maxDistance: number): boolean {
    const queryLength = query.length;
    const candidateLength = candidate.length;
    if (Math.abs(queryLength - candidateLength) > maxDistance) return false;

    let previous = Array.from({ length: candidateLength + 1 }, (_, index) => index);

    for (let i = 1; i <= queryLength; i += 1) {
      const current = [i];
      let rowMin = current[0];

      for (let j = 1; j <= candidateLength; j += 1) {
        const cost = query[i - 1] === candidate[j - 1] ? 0 : 1;
        const value = Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + cost,
        );
        current[j] = value;
        rowMin = Math.min(rowMin, value);
      }

      if (rowMin > maxDistance) return false;
      previous = current;
    }

    return previous[candidateLength] <= maxDistance;
  }

  function fuzzyTokenMatch(queryToken: string, candidateToken: string): boolean {
    if (!queryToken || !candidateToken) return false;
    if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return true;
    if (queryToken.length >= 3 && isSubsequenceMatch(queryToken, candidateToken)) return true;

    const maxDistance = queryToken.length >= 8 ? 2 : queryToken.length >= 5 ? 1 : 0;
    if (!maxDistance) return false;

    return isEditDistanceWithin(queryToken, candidateToken, maxDistance);
  }

  function collectSearchTexts(keys: string[], extras: string[] = []): string[] {
    const texts = new Set<string>();

    for (const key of keys) {
      const normalizedKey = normalizeSearchText(key);
      if (normalizedKey) texts.add(normalizedKey);

      for (const translated of allTranslations(key)) {
        const normalizedTranslation = normalizeSearchText(translated);
        if (normalizedTranslation) texts.add(normalizedTranslation);
      }

      for (const alias of SEARCH_ALIASES[key] || []) {
        const normalizedAlias = normalizeSearchText(alias);
        if (normalizedAlias) texts.add(normalizedAlias);
      }
    }

    for (const extra of extras) {
      const normalizedExtra = normalizeSearchText(extra);
      if (normalizedExtra) texts.add(normalizedExtra);
    }

    return [...texts];
  }

  function matchesSearch(keys: string[], extras: string[] = []): boolean {
    const normalizedQuery = normalizeSearchText(searchQuery);
    if (!normalizedQuery) return true;

    const candidateTexts = collectSearchTexts(keys, extras);
    if (candidateTexts.some((candidate) => candidate.includes(normalizedQuery))) return true;

    const queryTokens = tokenizeSearchText(normalizedQuery);
    const candidateTokens = candidateTexts.flatMap(tokenizeSearchText);

    return queryTokens.every((queryToken) =>
      candidateTexts.some((candidate) => candidate.includes(queryToken)) ||
      candidateTokens.some((candidateToken) => fuzzyTokenMatch(queryToken, candidateToken))
    );
  }

  function sectionVisible(keys: string[], extras: string[] = []): boolean {
    if (!searchQuery.trim()) return true;
    return matchesSearch(keys, extras);
  }

  function visibleFilters(filters: SearchableFilter[], extras: Record<string, string[]> = {}): SearchableFilter[] {
    if (!searchQuery.trim()) return filters;
    return filters.filter((filter) =>
      matchesSearch([filter.key], [filter.label, ...(extras[filter.key] || [])])
    );
  }

  async function selectLanguage(lang: string) {
    patchLocalSettings({ language: lang });
    langMenuOpen = false;
    await saveSettings({ language: lang });
    window.location.reload();
  }

  function openStandalonePage() {
    browser.tabs.create({ url: browser.runtime.getURL('popup.html?view=page') });
  }

  function requestBetaEnable() {
    betaConfirmOpen = true;
  }

  function cancelBetaEnable() {
    betaConfirmOpen = false;
  }

  function confirmBetaEnable() {
    betaConfirmOpen = false;
    void applySettingsPatch({ betaEnabled: true });
  }

  function toggleBetaFeatures(value: boolean) {
    if (value) {
      requestBetaEnable();
      return;
    }
    betaConfirmOpen = false;
    if (activeSheet) clearSheetState();
    void applySettingsPatch({
      betaEnabled: false,
      disableAvatarLiveRedirect: false,
      betaHomepageRevealAnimation: false,
    });
  }

  function toggleBetaVideoFrameScreenshot(value: boolean) {
    void applySettingsPatch({
      betaVideoFrameScreenshot: value,
      betaScreenshotInstantDownload: value ? settings.betaScreenshotInstantDownload : false,
    });
  }

  function openLogoPage() {
    if (isStandaloneView) {
      logoDraftUrl = settings.customLogo;
      activeSheet = 'logo';
      return;
    }
    browser.tabs.create({ url: browser.runtime.getURL('logo.html') });
  }

  function removeLogo() {
    logoAnimationConfirmOpen = false;
    const nextPatch: Partial<Settings> = {
      customLogo: '',
      customLogoRatio: 0,
    };
    if (settings.logoVariant === 'custom') {
      nextPatch.logoVariant = 'rewind';
      nextPatch.hideLogoAnimation = true;
    }
    patchLocalSettings(nextPatch);
    void saveSettings(nextPatch);
  }

  function selectLogoVariant(variant: Settings['logoVariant']) {
    if (variant === 'custom' && !settings.customLogo) {
      openLogoPage();
      return;
    }

    const patch: Partial<Settings> = { logoVariant: variant };
    if (variant !== 'youtube') {
      patch.hideLogoAnimation = true;
    }
    void applySettingsPatch(patch);
  }

  function toggleHideLogoAnimation(value: boolean) {
    if (!value && settings.logoVariant !== 'youtube') {
      logoAnimationConfirmOpen = true;
      return;
    }
    logoAnimationConfirmOpen = false;
    void applySettingsPatch({ hideLogoAnimation: value });
  }

  function cancelLogoAnimationConfirm() {
    logoAnimationConfirmOpen = false;
  }

  function confirmLogoAnimationEnable() {
    logoAnimationConfirmOpen = false;
    void applySettingsPatch({ hideLogoAnimation: false });
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

  function showDeveloperFeedback(text: string, type: 'ok' | 'error' = 'ok') {
    developerFeedback = { text, type };
    clearTimeout(developerFeedbackTimeout);
    developerFeedbackTimeout = setTimeout(() => { developerFeedback = null; }, 2500);
  }

  function exportFile(format: 'json' | 'txt') {
    const payload = createSettingsExportPayload(settings, getCurrentConfigName());
    const ext = format === 'json' ? 'json' : 'txt';
    const mime = format === 'json' ? 'application/json' : 'text/plain';
    const content = stringifySettingsTransfer(payload, format);
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildExportFileName(ext);
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard() {
    try {
      const payload = createSettingsExportPayload(settings, getCurrentConfigName());
      await navigator.clipboard.writeText(stringifySettingsTransfer(payload, 'json'));
      showFeedback('copied');
    } catch {
      showFeedback('error');
    }
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
  }

  function handleImportSuccess(target: 'popup' | 'sheet') {
    if (target === 'sheet') {
      showSheetFeedback(t('importSuccess'));
      return;
    }
    showFeedback('imported');
  }

  function openImportPage() {
    if (isStandaloneView) {
      activeSheet = 'import';
      return;
    }
    browser.tabs.create({ url: browser.runtime.getURL('import.html') });
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseSettingsTransfer(text);
      if (parsed) {
        await applyImport(parsed.settings);
        handleImportSuccess('popup');
      }
      else showFeedback('error');
    } catch {
      showFeedback('error');
    }
  }

  async function pasteSettingsIntoSheet() {
    if (!navigator.clipboard?.readText) {
      showSheetFeedback(t('pasteClipboardError'), 'error');
      return;
    }
    try {
      importPasting = true;
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        showSheetFeedback(t('pasteClipboardEmpty'), 'error');
        return;
      }
      const parsed = parseSettingsTransfer(text);
      if (!parsed) {
        showSheetFeedback(t('importError'), 'error');
        return;
      }
      await applyImport(parsed.settings);
      handleImportSuccess('sheet');
    } catch {
      showSheetFeedback(t('pasteClipboardError'), 'error');
    } finally {
      importPasting = false;
    }
  }

  async function loadImportFile(file: File, mode: 'import' | 'profile-import') {
    if (!file) return;
    const text = await file.text();
    const parsed = parseSettingsTransfer(text);
    if (!parsed) {
      showSheetFeedback(t('importError'), 'error');
      return;
    }

    if (mode === 'profile-import') {
      pendingProfileText = text;
      pendingProfileFileName = file.name;
      sheetProfileNameInput = parsed.configName || file.name.replace(/\.(json|txt)$/i, '');
      return;
    }

    await applyImport(parsed.settings);
    handleImportSuccess('sheet');
  }

  async function pasteProfileIntoSheet() {
    if (!navigator.clipboard?.readText) {
      showSheetFeedback(t('pasteClipboardError'), 'error');
      return;
    }
    try {
      importPasting = true;
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        showSheetFeedback(t('pasteClipboardEmpty'), 'error');
        return;
      }
      const parsed = parseSettingsTransfer(text);
      if (!parsed) {
        showSheetFeedback(t('importError'), 'error');
        return;
      }
      pendingProfileText = text;
      pendingProfileFileName = 'clipboard.json';
      sheetProfileNameInput = parsed.configName || 'clipboard-profile';
    } catch {
      showSheetFeedback(t('pasteClipboardError'), 'error');
    } finally {
      importPasting = false;
    }
  }

  async function confirmSheetProfileImport() {
    const name = sheetProfileNameInput.trim();
    if (!name) return;
    const parsed = parseSettingsTransfer(pendingProfileText);
    if (!parsed) {
      showSheetFeedback(t('importError'), 'error');
      return;
    }

    delete (parsed.settings as any).customProfiles;
    delete (parsed.settings as any).language;
    delete (parsed.settings as any).activeProfile;
    delete (parsed.settings as any).developerEnabled;
    delete (parsed.settings as any).betaStandalonePage;

    const newProfile: CustomProfile = { name, settings: parsed.settings };
    const profiles = cloneCustomProfiles([...(settings.customProfiles || []), newProfile]);
    patchLocalSettings({ customProfiles: profiles });
    await saveSettings({ customProfiles: profiles });
    pendingProfileText = '';
    pendingProfileFileName = '';
    sheetProfileNameInput = '';
    showSheetFeedback(t('profileSaved'));
  }

  function cancelSheetProfileImport() {
    pendingProfileText = '';
    pendingProfileFileName = '';
    sheetProfileNameInput = '';
  }

  function exportActiveCustomProfile(): void {
    const activeProfile = getActiveCustomProfile();
    if (!activeProfile) return;
    const payload = createProfileExportPayload(activeProfile);
    const content = stringifySettingsTransfer(payload, 'json');
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildProfileExportFileName(activeProfile.name, 'json');
    a.click();
    URL.revokeObjectURL(url);
  }

  function requestDeveloperEnable(): void {
    developerConfirmOpen = true;
  }

  function cancelDeveloperEnable(): void {
    developerConfirmOpen = false;
  }

  function confirmDeveloperEnable(): void {
    developerConfirmOpen = false;
    void applySettingsPatch({ developerEnabled: true });
  }

  function toggleDeveloperTools(value: boolean): void {
    if (value) {
      requestDeveloperEnable();
      return;
    }
    developerConfirmOpen = false;
    developerFeedback = null;
    showResetConfirm = false;
    void applySettingsPatch({ developerEnabled: false });
  }

  async function copyDeveloperSnapshot(): Promise<void> {
    try {
      const payload = createSettingsExportPayload(settings, getCurrentConfigName());
      const snapshot = {
        app: 'YouTube Rewind',
        version: browser.runtime.getManifest().version,
        exportedAt: new Date().toISOString(),
        browserUiLanguage: browser.i18n.getUILanguage(),
        settingsLanguage: settings.language,
        activeProfile: settings.activeProfile,
        currentConfigName: getCurrentConfigName(),
        themeMode: resolveThemeMode(settings.interfaceThemeMode),
        userAgent: navigator.userAgent,
        settings: payload,
      };
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      showDeveloperFeedback(t('developerDebugCopied'));
    } catch {
      showDeveloperFeedback(t('developerActionFailed'), 'error');
    }
  }

  async function clearDeveloperUpdateCache(): Promise<void> {
    try {
      await browser.storage.local.remove(CACHE_KEY);
      latestVersion = '';
      releaseUrl = '';
      updateState = 'idle';
      showDeveloperFeedback(t('developerUpdateCacheCleared'));
    } catch {
      showDeveloperFeedback(t('developerActionFailed'), 'error');
    }
  }

  async function resetDeveloperWatchTime(): Promise<void> {
    try {
      await clearWatchTimeState();
      showDeveloperFeedback(t('developerWatchTimeReset'));
    } catch {
      showDeveloperFeedback(t('developerActionFailed'), 'error');
    }
  }

  function reloadExtension(): void {
    browser.runtime.reload();
  }

  function validateLogoRatio(width: number, height: number): number {
    const ratio = width / height;
    if (ratio > 6 || ratio < 0.5) {
      throw new Error('ratio_invalid');
    }
    return ratio;
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read_failed'));
      reader.readAsDataURL(file);
    });
  }

  function loadImageRatio(dataUrl: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          resolve(validateLogoRatio(img.naturalWidth, img.naturalHeight));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('type_invalid'));
      img.src = dataUrl;
    });
  }

  function loadVideoRatio(dataUrl: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        try {
          resolve(validateLogoRatio(video.videoWidth, video.videoHeight));
        } catch (error) {
          reject(error);
        }
      };
      video.onerror = () => reject(new Error('type_invalid'));
      video.src = dataUrl;
      video.load();
    });
  }

  function getLogoSizeError(isVideo: boolean): string {
    if (!isVideo) return t('customLogoErrorSize');
    return settings.language === 'ru'
      ? 'Видео слишком большое (макс. 16 МБ)'
      : 'Video is too large (max 16 MB)';
  }

  async function processLogoFile(file: File) {
    if (!file) return;
    const fileType = file.type.toLowerCase();
    const isImage = fileType.startsWith('image/');
    const isVideo = fileType.startsWith('video/');

    if (!isImage && !isVideo) {
      showSheetFeedback(t('customLogoErrorType'), 'error');
      return;
    }

    const sizeLimit = isVideo ? MAX_LOGO_VIDEO_FILE_SIZE : MAX_LOGO_IMAGE_FILE_SIZE;
    if (file.size > sizeLimit) {
      showSheetFeedback(getLogoSizeError(isVideo), 'error');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const ratio = isVideo ? await loadVideoRatio(dataUrl) : await loadImageRatio(dataUrl);
      logoDraftUrl = dataUrl;
      patchLocalSettings({ logoVariant: 'custom', customLogo: dataUrl, customLogoRatio: ratio, hideLogoAnimation: true });
      await saveSettings({ logoVariant: 'custom', customLogo: dataUrl, customLogoRatio: ratio, hideLogoAnimation: true });
      showSheetFeedback(t('customLogoSaved'));
    } catch (error) {
      if (error instanceof Error && error.message === 'ratio_invalid') {
        showSheetFeedback(t('customLogoErrorRatio'), 'error');
      } else {
        showSheetFeedback(t('customLogoErrorType'), 'error');
      }
    }
  }

  async function pasteLogoFromClipboard() {
    if (!navigator.clipboard?.read) {
      showSheetFeedback(t('pasteImageError'), 'error');
      return;
    }

    try {
      logoPasting = true;
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const mediaType = item.types.find((type) => type.startsWith('image/') || type.startsWith('video/'));
        if (!mediaType) continue;
        const blob = await item.getType(mediaType);
        const ext = mediaType.split('/')[1]?.replace('jpeg', 'jpg') || (mediaType.startsWith('video/') ? 'webm' : 'png');
        await processLogoFile(new File([blob], `clipboard-logo.${ext}`, { type: mediaType }));
        return;
      }
      showSheetFeedback(t('pasteImageEmpty'), 'error');
    } catch {
      showSheetFeedback(t('pasteImageError'), 'error');
    } finally {
      logoPasting = false;
    }
  }

  async function removeLogoFromSheet() {
    logoDraftUrl = '';
    const nextPatch: Partial<Settings> = {
      customLogo: '',
      customLogoRatio: 0,
    };
    if (settings.logoVariant === 'custom') {
      nextPatch.logoVariant = 'rewind';
      nextPatch.hideLogoAnimation = true;
    }
    patchLocalSettings(nextPatch);
    await saveSettings(nextPatch);
    showSheetFeedback(t('customLogoRemoved'));
  }

  function onImportFileInput(event: Event, mode: 'import' | 'profile-import') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void loadImportFile(file, mode);
    input.value = '';
  }

  function onLogoFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void processLogoFile(file);
    input.value = '';
  }

  // --- Profiles ---

  function applyProfile(profileId: string) {
    if (profileId === 'none') {
      update('activeProfile', 'none');
      return;
    }
    const profile = PROFILES[profileId];
    if (!profile) return;

    const resetData = { ...DEFAULT_SETTINGS };
    delete (resetData as any).language;
    stripLogoDefaults(resetData);
    delete (resetData as any).interfaceThemeMode;
    delete (resetData as any).interfaceThemeHue;
    delete (resetData as any).interfaceThemeColor;
    delete (resetData as any).defaultQuality;
    delete (resetData as any).customProfiles;
    delete (resetData as any).betaEnabled;
    delete (resetData as any).betaStandalonePage;
    delete (resetData as any).betaHomepageRevealAnimation;
    delete (resetData as any).betaVideoFrameScreenshot;
    delete (resetData as any).betaScreenshotInstantDownload;
    delete (resetData as any).developerEnabled;
    const merged = { ...resetData, ...profile, activeProfile: profileId };
    patchLocalSettings(merged);
    void saveSettings(merged);
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
    palette: 'M480-120q-74.23 0-139.19-28.5Q275.84-177 227.42-225.42 179-273.84 150.5-338.81 122-403.77 122-478q0-155 100.08-257.5Q322.15-838 477-838q149 0 255 96.5T838-494q0 75-50.57 124.5Q736.85-320 660-320h-63q-11 0-18.5 7.5T571-294q0 7 7.5 14.5T597-272q19 0 33 14.5t14 34.5q0 48-43.81 75.5Q556.38-120 480-120Zm-3-60q49 0 82.5-14.5T593-223q0-2-6.5-5.5T569-232q-34 0-58-24t-24-58q0-34 24-58t58-24h91q46 0 82-31.5t36-79.5q0-121-85-196t-216-75q-128 0-211.5 81T182-478q0 122 85.5 210T477-180Zm-197-223q25 0 42.5-17.5T340-463q0-25-17.5-42.5T280-523q-25 0-42.5 17.5T220-463q0 25 17.5 42.5T280-403Zm100-130q25 0 42.5-17.5T440-593q0-25-17.5-42.5T380-653q-25 0-42.5 17.5T320-593q0 25 17.5 42.5T380-533Zm200 0q25 0 42.5-17.5T640-593q0-25-17.5-42.5T580-653q-25 0-42.5 17.5T520-593q0 25 17.5 42.5T580-533Zm100 130q25 0 42.5-17.5T740-463q0-25-17.5-42.5T680-523q-25 0-42.5 17.5T620-463q0 25 17.5 42.5T680-403Z',
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
    const profileSettings = extractProfileSettings(settings);
    const newProfile: CustomProfile = { name, settings: profileSettings };
    const profiles = cloneCustomProfiles([...(settings.customProfiles || []), newProfile]);
    patchLocalSettings({ customProfiles: profiles });
    void saveSettings({ customProfiles: profiles });
    profileNameInput = '';
    showProfileAdd = false;
    showFeedback('profile');
  }

  function importProfileFromFile() {
    if (isStandaloneView) {
      activeSheet = 'profile-import';
      return;
    }
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
    delete (resetData as any).betaStandalonePage;
    delete (resetData as any).developerEnabled;
    const profileSettings = resolveAppliedProfileSettings(profile.settings);
    stripLogoDefaults(resetData, profileSettings);

    const merged = { ...resetData, ...profileSettings, activeProfile: 'custom:' + profile.name };
    patchLocalSettings(merged);
    void saveSettings(merged);
    showFeedback('profile');
  }

  async function resetAllSettings() {
    const resetData = { ...DEFAULT_SETTINGS };
    const previousLanguage = settings.language;
    settings = cloneSettings(resetData);
    setLocale(resetData.language);
    if (resetData.language !== previousLanguage) {
      langVersion++;
    }
    await saveSettings(resetData);
    syncProfileModifiedState(settings);
    showResetConfirm = false;
    developerConfirmOpen = false;
    developerFeedback = null;
    showFeedback('reset');
  }

  let currentLangDisplay = $derived(getLanguageDisplayName(settings.language, false));

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

  const AVATAR_SHAPE_ITEMS = [
    { id: 'none', labelKey: 'shapeDefault', svgContent: '<circle cx="16" cy="16" r="13" fill="currentColor"/>' },
    { id: 'superellipse', labelKey: 'shapeSuperellipse', svgContent: '<rect x="3" y="3" width="26" height="26" rx="6" fill="currentColor"/>' },
    { id: 'rounded-square', labelKey: 'shapeRoundedSquare', svgContent: '<rect x="3" y="3" width="26" height="26" rx="3" fill="currentColor"/>' },
    { id: 'notched', labelKey: 'thumbShapeNotched', svgContent: '<path d="M10,2 H22 L30,10 V22 L22,30 H10 L2,22 V10 Z" fill="currentColor"/>' },
    { id: 'slanted', labelKey: 'thumbShapeSlanted', svgContent: '<path d="M8,3 H30 L24,29 H2 Z" fill="currentColor"/>' },
    { id: 'arch', labelKey: 'thumbShapeArch', svgContent: '<path d="M7,29 H25 Q29,29 29,25 V14 Q29,3 16,3 Q3,3 3,14 V25 Q3,29 7,29Z" fill="currentColor"/>' },
    { id: 'diamond', labelKey: 'shapeDiamond', svgContent: '<rect x="5" y="5" width="22" height="22" rx="5" fill="currentColor" transform="rotate(45 16 16)"/>' },
    { id: 'hexagon', labelKey: 'shapeHexagon', svgContent: '<path d="M18,1.5 L28,7.2 Q30,8.5,30,11 L30,21 Q30,23.5,28,24.8 L18,30.5 Q16,31.7,14,30.5 L4,24.8 Q2,23.5,2,21 L2,11 Q2,8.5,4,7.2 L14,1.5 Q16,0.3,18,1.5Z" fill="currentColor"/>' },
    { id: 'octagon', labelKey: 'shapeOctagon', svgContent: '<path d="M11,2 L21,2 Q23,2,25,4 L28,7 Q30,9,30,11 L30,21 Q30,23,28,25 L25,28 Q23,30,21,30 L11,30 Q9,30,7,28 L4,25 Q2,23,2,21 L2,11 Q2,9,4,7 L7,4 Q9,2,11,2Z" fill="currentColor"/>' },
    { id: 'clover', labelKey: 'shapeClover', svgContent: '<path d="M16,1 C20.5,1,21.8,5.8,26.2,7.8 C30.4,9.7,31,13.5,31,16 C31,20.5,26.2,21.8,24.2,26.2 C22.3,30.4,18.5,31,16,31 C11.5,31,10.2,26.2,5.8,24.2 C1.6,22.3,1,18.5,1,16 C1,11.5,5.8,10.2,7.8,5.8 C9.7,1.6,13.5,1,16,1Z" fill="currentColor"/>' },
    { id: 'flower', labelKey: 'shapeFlower', svgContent: '<path d="M26.8,5.2 C30,8.4,28.1,11.7,29.9,16 C31.3,20.1,30,23.6,26.8,26.8 C23.6,30,20.3,28.1,16,29.9 C11.9,31.3,8.4,30,5.2,26.8 C2,23.6,3.9,20.3,2.1,16 C0.7,11.9,2,8.4,5.2,5.2 C8.4,2,11.7,3.9,16,2.1 C20.1,0.7,23.6,2,26.8,5.2Z" fill="currentColor"/>' },
    { id: 'square', labelKey: 'shapeSquare', svgContent: '<rect x="3" y="3" width="26" height="26" fill="currentColor"/>' },
  ];

  const THUMBNAIL_SHAPE_ITEMS = [
    { id: 'none', labelKey: 'thumbShapeDefault', viewBox: '0 0 44 28', svgContent: '<rect x="2" y="4" width="40" height="20" rx="4" fill="currentColor"/>' },
    { id: 'sharp', labelKey: 'thumbShapeSharp', viewBox: '0 0 44 28', svgContent: '<rect x="2" y="4" width="40" height="20" fill="currentColor"/>' },
    { id: 'rounded', labelKey: 'thumbShapeRounded', viewBox: '0 0 44 28', svgContent: '<rect x="2" y="4" width="40" height="20" rx="6" fill="currentColor"/>' },
    { id: 'superellipse', labelKey: 'shapeSuperellipse', viewBox: '0 0 44 28', svgContent: '<rect x="2" y="4" width="40" height="20" rx="8" fill="currentColor"/>' },
    { id: 'notched', labelKey: 'thumbShapeNotched', viewBox: '0 0 44 28', svgContent: '<path d="M8,4 H36 L42,10 V18 L36,24 H8 L2,18 V10 Z" fill="currentColor"/>' },
    { id: 'slanted', labelKey: 'thumbShapeSlanted', viewBox: '0 0 44 28', svgContent: '<path d="M6,4 H42 L38,24 H2 Z" fill="currentColor"/>' },
    { id: 'arch', labelKey: 'thumbShapeArch', viewBox: '0 0 44 28', svgContent: '<path d="M8,24 H36 Q40,24 40,20 V14 Q40,4 22,4 Q4,4 4,14 V20 Q4,24 8,24 Z" fill="currentColor"/>' },
    { id: 'diamond', labelKey: 'shapeDiamond', viewBox: '0 0 44 28', svgContent: '<path d="M14,4 H30 L40,14 L30,24 H14 L4,14 Z" fill="currentColor"/>' },
    { id: 'hexagon', labelKey: 'shapeHexagon', viewBox: '0 0 44 28', svgContent: '<path d="M10,4 H34 L42,14 L34,24 H10 L2,14 Z" fill="currentColor"/>' },
    { id: 'octagon', labelKey: 'shapeOctagon', viewBox: '0 0 44 28', svgContent: '<path d="M8,4 H36 L42,10 V18 L36,24 H8 L2,18 V10 Z" fill="currentColor"/>' },
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
  <div class="app-shell" data-locale={langVersion} class:app-shell-page={isStandaloneView} onclick={closeMenus} role="presentation">
      <header class="app-header">
        <div class="header-content">
          <div class="header-brand">
            <span class="app-logo" role="img" aria-label="YouTube Rewind"></span>
          </div>
          <div class="header-actions">
            {#if !isStandaloneView}
              <button class="info-button" onclick={openStandalonePage} title={t('betaOpenStandalone')} aria-label={t('betaOpenStandalone')}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="14" rx="2"/>
                  <path d="M8 20h8"/>
                </svg>
              </button>
            {/if}
            <button class="info-button" onclick={scrollToAbout} title={t('sectionAbout')} aria-label={t('sectionAbout')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>
            <div class="lang-wrapper">
              <!-- svelte-ignore a11y_consider_explicit_label -->
              <button class="lang-button" onclick={toggleLangMenu} aria-haspopup="true" aria-expanded={langMenuOpen} title={currentLangDisplay}>
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
                      <span class="lang-menu-item-copy">
                        <span class="lang-menu-item-label">{getLanguageDisplayName(lang.id, false)}</span>
                        {#if getLanguageLocalizedLabel(lang.id)}
                          <span class="lang-menu-item-note">{getLanguageLocalizedLabel(lang.id)}</span>
                        {/if}
                      </span>
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
                      <span>{t('updateDownload')}</span>
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
        <SettingsSection title={t('sectionProfiles')} icon={ICON.tune} hidden={!sectionVisible(['sectionProfiles', 'profileNone', 'profileFocus', 'profileMinimal', 'profileClean', 'profileSaveCurrent', 'profileFromFile'], ['custom', 'preset'])}>
          <div class="effect-picker">
            {#each PROFILE_OPTIONS as profile (profile.id)}
                <button
                  class="effect-option"
                  class:active={settings.activeProfile === profile.id}
                  onclick={() => applyProfile(profile.id)}
                >
                  <span class="effect-option-label">{t(profile.label)}</span>
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
                    <span class="effect-option-label">{cp.name}</span>
                  </button>
                {/if}
                <button class="custom-profile-delete" onclick={() => deleteCustomProfile(i)} title={t('profileDelete')} aria-label={t('profileDelete')}>
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
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
            <div class="profile-actions-row">
              <button class="action-btn" onclick={() => { showProfileAdd = true; }} aria-label="Add profile">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              {#if getActiveCustomProfile()}
                <button class="action-btn" onclick={exportActiveCustomProfile}>
                  {t('profileExport')}
                </button>
              {/if}
              {#if profileModified && settings.activeProfile !== 'none'}
                <button class="action-btn action-btn-save" onclick={saveChangesToProfile}>
                  {t('profileSaveChanges')}
                </button>
              {/if}
            </div>
          {/if}
          {#if (settings.customProfiles || []).length > 0}
            <div class="profile-helper">{t('profileRenameHelper')}</div>
          {/if}
          {#if dataFeedback === 'profile'}
            <div class="data-feedback data-feedback-ok" style="margin: 0 10px 8px;">
              {t('profileApplied')}
            </div>
          {/if}
        </SettingsSection>

        <SettingsSection title={t('sectionPlayer')} icon={ICON.play_circle} hidden={!sectionVisible(['sectionPlayer', 'settingPlaybackSpeed', 'settingClassicPlayer', 'settingWidePlayer', 'settingClassicLikeIcons', 'settingAdaptiveDescription'])}>
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
          <Toggle label={t('settingClassicPlayer')} checked={settings.classicPlayer} onchange={(v) => update('classicPlayer', v)} />
          <Toggle label={t('settingWidePlayer')} checked={settings.widePlayer} onchange={(v) => update('widePlayer', v)} />
          <Toggle label={t('settingAdaptiveDescription')} checked={settings.adaptiveColorsDescription} onchange={(v) => update('adaptiveColorsDescription', v)} />
          <Toggle label={t('settingClassicLikeIcons')} checked={settings.classicLikeIcons} onchange={(v) => update('classicLikeIcons', v)} />
        </SettingsSection>

        <SettingsSection title={t('sectionWatchPage')} icon={ICON.visibility} hidden={!sectionVisible(['sectionWatchPage', 'settingHideJoinButton', 'settingHideSubscribeButton', 'settingHideLikeDislike', 'settingHideShareButton', 'settingHideDownloadButton', 'settingHideClipButton', 'settingHideThanksButton', 'settingHideSaveButton', 'sectionBannerStyle', 'settingDownloadThumbnail', 'settingBetaVideoFrameScreenshot', 'settingBetaScreenshotInstantDownload'])}>
          <ChipGroup filters={visibleFilters(videoButtonFilters)} />
          <Toggle label={t('settingDownloadThumbnail')} checked={settings.downloadThumbnailButton} onchange={(v) => void applySettingsPatch({ downloadThumbnailButton: v })} />
          <Toggle label={t('settingBetaVideoFrameScreenshot')} checked={settings.betaVideoFrameScreenshot} onchange={toggleBetaVideoFrameScreenshot} />
          {#if settings.betaVideoFrameScreenshot}
            <Toggle label={t('settingBetaScreenshotInstantDownload')} checked={settings.betaScreenshotInstantDownload} onchange={(v) => void applySettingsPatch({ betaScreenshotInstantDownload: v })} />
          {/if}
          <div class="sub-label">{t('sectionBannerStyle')}</div>
          <div class="effect-picker">
            {#each BANNER_STYLES as style (style.id)}
              <button
                class="effect-option"
                class:active={settings.bannerStyle === style.id}
                onclick={() => update('bannerStyle', style.id)}
              >
                <span class="effect-option-label">{t(style.label)}</span>
              </button>
            {/each}
          </div>
        </SettingsSection>

        <SettingsSection title={t('sectionWatchTimer')} icon={ICON.timer} hidden={!sectionVisible(['sectionWatchTimer', 'settingWatchTimerEnabled', 'settingWatchTimeLimit', 'settingWatchTimeLimitBlockRepeat'])}>
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

        <SettingsSection title={t('sectionHomepageFilter')} icon={ICON.home} hidden={!sectionVisible(['sectionHomepageFilter', 'settingVideosPerRow', 'settingHideShorts', 'settingHidePosts', 'settingHideMixes', 'settingHideBreakingNews', 'settingHideLatestPosts', 'settingHideExploreTopics', 'settingHideNewBadge', 'settingHidePlayables', 'settingHideFilterBar'])}>
          <Slider
            label={t('settingVideosPerRow')}
            value={settings.videosPerRow}
            min={0}
            max={8}
            defaultLabel={t('settingVideosPerRowDefault')}
            onchange={(v) => update('videosPerRow', v)}
          />
          <ChipGroup filters={visibleFilters(homepageFilters)} />
        </SettingsSection>

        <SettingsSection title={t('sectionSearchFilter')} icon={ICON.search} hidden={!sectionVisible(['sectionSearchFilter', 'settingHideSearchShorts', 'settingHideSearchChannels', 'settingHideSearchPeopleWatched'])}>
          <ChipGroup filters={visibleFilters(searchFilters)} />
        </SettingsSection>

        <SettingsSection title={t('sectionTopBar')} icon={ICON.web_asset} hidden={!sectionVisible(['sectionTopBar', 'settingHideTopbarCreate', 'settingHideTopbarVoiceSearch', 'settingHideTopbarNotifications', 'settingHideTopbarSearch', 'settingHideCountryCode', 'settingCustomLogo', 'settingLogoVariant', 'settingCustomLogoSize', 'settingHideLogoAnimation'])}>
          <ChipGroup filters={visibleFilters(topbarFilters)} />
          <div class="sub-label">{t('settingLogoVariant')}</div>
          <div class="effect-picker">
            {#each LOGO_VARIANTS as variant (variant)}
              <button
                class="effect-option"
                class:active={settings.logoVariant === variant}
                onclick={() => selectLogoVariant(variant)}
              >
                <span class="effect-option-label">{getLogoPresetLabel(variant)}</span>
              </button>
            {/each}
          </div>
          <div class="inline-row">
            <span class="inline-label">{t('settingCustomLogo')}</span>
            <div class="inline-actions">
              {#if settings.logoVariant === 'rewind'}
                <span class="logo-preview logo-preview-rewind" aria-hidden="true"></span>
              {:else if getEffectiveLogoSource(settings.logoVariant, settings.customLogo)}
                {#if isVideoLogo(getEffectiveLogoSource(settings.logoVariant, settings.customLogo))}
                  <video src={getEffectiveLogoSource(settings.logoVariant, settings.customLogo)} class="logo-preview" muted autoplay loop playsinline></video>
                {:else}
                  <img src={getEffectiveLogoSource(settings.logoVariant, settings.customLogo)} alt="" class="logo-preview" />
                {/if}
              {/if}
              <button class="action-btn" onclick={openLogoPage}>{t('customLogoUpload')}</button>
              {#if settings.customLogo}
                <button class="action-btn" onclick={removeLogo}>{t('customLogoRemove')}</button>
              {/if}
            </div>
          </div>
          <Slider
            label={t('settingCustomLogoSize')}
            value={getLogoScaleValue(settings, settings.logoVariant)}
            min={40}
            max={220}
            formatDisplay={formatPercent}
            parseInput={parsePercent}
            onchange={(v) => updateLogoScale(settings.logoVariant, v)}
          />
          <div class="sheet-actions-row sheet-actions-inline">
            <button class="action-btn" onclick={() => resetLogoScale(settings.logoVariant)}>
              {t('resetSettings')}
            </button>
          </div>
          <Toggle label={t('settingHideLogoAnimation')} checked={settings.hideLogoAnimation} onchange={toggleHideLogoAnimation} />
          {#if logoAnimationConfirmOpen}
            <div class="inline-confirm inline-confirm-warning">
              <div class="inline-confirm-title">{t('logoAnimationWarningTitle')}</div>
              <div class="inline-confirm-message">{t('logoAnimationCustomWarning')}</div>
              <div class="inline-confirm-actions">
                <button class="action-btn" onclick={cancelLogoAnimationConfirm}>{t('logoAnimationWarningCancel')}</button>
                <button class="action-btn action-btn-save" onclick={confirmLogoAnimationEnable}>{t('logoAnimationWarningConfirm')}</button>
              </div>
            </div>
          {/if}
        </SettingsSection>

        <SettingsSection title={t('sectionSidebarFilter')} icon={ICON.view_sidebar} hidden={!sectionVisible(['sectionSidebarFilter', 'settingHideSidebarSubscriptions', 'settingHideSidebarYou', 'settingHideSidebarExplore', 'settingHideSidebarMoreFromYT', 'settingHideSidebarReportHistory', 'settingHideSidebarFooter'])}>
          <ChipGroup filters={visibleFilters(sidebarFilters)} />
        </SettingsSection>

        <SettingsSection title={t('sectionThumbnailEffect')} icon={ICON.image} hidden={!sectionVisible(['sectionThumbnailEffect', 'thumbnailHoverReveal', 'settingDisableThumbnailPreview', 'settingDisableHoverAnimation', 'sectionThumbnailShape'])}>
          <div class="effect-picker">
            {#each THUMBNAIL_EFFECTS as effect (effect.id)}
              <button
                class="effect-option"
                class:active={settings.thumbnailEffect === effect.id}
                onclick={() => update('thumbnailEffect', effect.id)}
              >
                <span class="effect-option-label">{t(effect.label)}</span>
              </button>
            {/each}
          </div>
          {#if settings.thumbnailEffect !== 'none'}
            <Toggle label={t('thumbnailHoverReveal')} checked={settings.thumbnailHoverReveal} onchange={(v) => update('thumbnailHoverReveal', v)} />
          {/if}
          <Toggle label={t('settingDisableThumbnailPreview')} checked={settings.disableThumbnailPreview} onchange={(v) => update('disableThumbnailPreview', v)} />
          <Toggle label={t('settingDisableHoverAnimation')} checked={settings.disableHoverAnimation} onchange={(v) => update('disableHoverAnimation', v)} />
          <div class="sub-label">{t('sectionThumbnailShape')}</div>
          <ShapePicker
            variant="thumbnail"
            value={settings.thumbnailShape}
            onchange={(v) => update('thumbnailShape', v)}
            items={THUMBNAIL_SHAPE_ITEMS.map((shape) => ({ ...shape, label: t(shape.labelKey) }))}
          />
        </SettingsSection>

        <SettingsSection title={t('sectionAvatarShape')} icon={ICON.person} hidden={!sectionVisible(['sectionAvatarShape'], ['avatar', 'shape', 'form'])}>
          <ShapePicker
            variant="avatar"
            value={settings.avatarShape}
            onchange={(v) => update('avatarShape', v)}
            items={AVATAR_SHAPE_ITEMS.map((shape) => ({ ...shape, label: t(shape.labelKey) }))}
          />
        </SettingsSection>

        <SettingsSection title={t('sectionInterface')} icon={ICON.palette} hidden={!sectionVisible(['sectionInterface', 'settingInterfaceThemeMode', 'settingInterfaceThemePresets', 'settingInterfaceThemeColor', 'settingInterfaceThemeCustomColor', 'settingInterfaceThemeReset', 'themeAuto', 'themeDark', 'themeLight'], ['theme', 'color', 'accent', 'ui'])}>
          <div class="sub-label">{t('settingInterfaceThemeMode')}</div>
          <div class="effect-picker">
            <button
              class="effect-option"
              class:active={settings.interfaceThemeMode === 'auto'}
              onclick={() => switchInterfaceThemeMode('auto')}
            >
              <span class="effect-option-label">{t('themeAuto')}</span>
            </button>
            <button
              class="effect-option"
              class:active={settings.interfaceThemeMode === 'dark'}
              onclick={() => switchInterfaceThemeMode('dark')}
            >
              <span class="effect-option-label">{t('themeDark')}</span>
            </button>
            <button
              class="effect-option"
              class:active={settings.interfaceThemeMode === 'light'}
              onclick={() => switchInterfaceThemeMode('light')}
            >
              <span class="effect-option-label">{t('themeLight')}</span>
            </button>
          </div>
          <div class="sub-label">{t('settingInterfaceThemePresets')}</div>
          <div class="effect-picker interface-theme-presets">
            {#each THEME_PRESETS as preset (preset.id)}
              <button
                class="effect-option interface-theme-preset"
                class:active={isThemePresetActive(preset)}
                onclick={() => applyThemePreset(preset)}
              >
                <span class="interface-theme-preset-swatch" style={`background:${getThemePresetColor(preset)}`}></span>
                <span class="effect-option-label">{t(preset.label)}</span>
              </button>
            {/each}
          </div>
          <Slider
            label={t('settingInterfaceThemeColor')}
            value={settings.interfaceThemeHue}
            min={0}
            max={360}
            formatDisplay={formatThemeHue}
            onchange={updateInterfaceThemeHue}
          />
          <ColorPicker
            label={t('settingInterfaceThemeCustomColor')}
            value={getSeedThemeColor(settings.interfaceThemeColor)}
            presets={themeColorPresets}
            floating={isStandaloneView}
            onchange={commitInterfaceThemeColor}
          />
          <div class="interface-theme-actions">
            <button type="button" class="action-btn interface-theme-reset" onclick={resetInterfaceThemePalette}>
              {t('settingInterfaceThemeReset')}
            </button>
          </div>
        </SettingsSection>

        <SettingsSection title={t('sectionDeveloper')} icon={ICON.database} hidden={!sectionVisible(['sectionDeveloper', 'settingDeveloperEnabled', 'developerCopyDebug', 'developerClearUpdateCache', 'developerResetWatchTime', 'developerReloadExtension', 'exportLabel', 'importLabel', 'resetSettings'])}>
          <div class="data-section">
            <div class="data-toggle-wrap">
              <Toggle label={t('settingDeveloperEnabled')} checked={settings.developerEnabled} onchange={toggleDeveloperTools} />
            </div>
            {#if settings.developerEnabled}
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
                <div class="data-group-label">{t('developerDiagnostics')}</div>
                <div class="data-actions">
                  <button class="action-btn" onclick={() => void copyDeveloperSnapshot()}>{t('developerCopyDebug')}</button>
                  <button class="action-btn" onclick={() => void clearDeveloperUpdateCache()}>{t('developerClearUpdateCache')}</button>
                  <button class="action-btn" onclick={() => void resetDeveloperWatchTime()}>{t('developerResetWatchTime')}</button>
                </div>
              </div>
              <div class="data-divider"></div>
              <div class="data-group">
                <div class="data-group-label">{t('developerMaintenance')}</div>
                <div class="data-actions">
                  <button class="action-btn" onclick={reloadExtension}>{t('developerReloadExtension')}</button>
                  <button class="action-btn action-btn-danger" onclick={() => { showResetConfirm = true; }}>{t('resetSettings')}</button>
                </div>
              </div>
            {/if}
            {#if developerConfirmOpen}
              <div class="inline-confirm inline-confirm-warning">
                <div class="inline-confirm-title">{t('developerEnableTitle')}</div>
                <div class="inline-confirm-message">{t('developerEnableMessage')}</div>
                <div class="inline-confirm-actions">
                  <button class="action-btn" onclick={cancelDeveloperEnable}>{t('developerEnableCancel')}</button>
                  <button class="action-btn action-btn-save" onclick={confirmDeveloperEnable}>{t('developerEnableConfirm')}</button>
                </div>
              </div>
            {/if}
            {#if showResetConfirm}
              <div class="inline-confirm inline-confirm-danger">
                <div class="inline-confirm-title">{t('resetConfirmTitle')}</div>
                <div class="inline-confirm-message">{t('resetConfirmMessage')}</div>
                <div class="inline-confirm-actions">
                  <button class="action-btn" onclick={() => { showResetConfirm = false; }}>{t('resetCancelButton')}</button>
                  <button class="action-btn action-btn-danger" onclick={resetAllSettings}>{t('resetConfirmButton')}</button>
                </div>
              </div>
            {/if}
            {#if dataFeedback && dataFeedback !== 'profile'}
              <div class="data-feedback" class:data-feedback-ok={dataFeedback === 'copied' || dataFeedback === 'imported' || dataFeedback === 'reset'} class:data-feedback-err={dataFeedback === 'error'}>
                {dataFeedback === 'copied'
                  ? t('copiedToClipboard')
                  : dataFeedback === 'imported'
                    ? t('importSuccess')
                    : dataFeedback === 'reset'
                      ? t('resetDone')
                      : t('importError')}
              </div>
            {/if}
            {#if developerFeedback}
              <div class="data-feedback" class:data-feedback-ok={developerFeedback.type === 'ok'} class:data-feedback-err={developerFeedback.type === 'error'}>
                {developerFeedback.text}
              </div>
            {/if}
          </div>
        </SettingsSection>

        <SettingsSection title={t('sectionBeta')} icon={ICON.info} hidden={!sectionVisible(['sectionBeta', 'settingBetaEnabled', 'settingDefaultQuality', 'settingDisableAvatarLive', 'settingBetaHomepageRevealAnimation'])}>
          <Toggle label={t('settingBetaEnabled')} checked={settings.betaEnabled} onchange={toggleBetaFeatures} />
          {#if settings.betaEnabled}
            <Slider
              label={t('settingDefaultQuality')}
              value={qualityToSlider(settings.defaultQuality)}
              min={0}
              max={9}
              defaultLabel={t('qualityAuto')}
              formatDisplay={formatQuality}
              onchange={(v) => update('defaultQuality', sliderToQuality(v))}
            />
            <Toggle label={t('settingDisableAvatarLive')} checked={settings.disableAvatarLiveRedirect} onchange={(v) => void applySettingsPatch({ disableAvatarLiveRedirect: v })} />
            <Toggle label={t('settingBetaHomepageRevealAnimation')} checked={settings.betaHomepageRevealAnimation} onchange={(v) => void applySettingsPatch({ betaHomepageRevealAnimation: v })} />
          {/if}

          {#if betaConfirmOpen}
            <div class="inline-confirm inline-confirm-warning">
              <div class="inline-confirm-title">{t('betaEnableTitle')}</div>
              <div class="inline-confirm-message">{t('betaEnableMessage')}</div>
              <div class="inline-confirm-actions">
                <button class="action-btn" onclick={cancelBetaEnable}>{t('betaEnableCancel')}</button>
                <button class="action-btn action-btn-save" onclick={confirmBetaEnable}>{t('betaEnableConfirm')}</button>
              </div>
            </div>
          {/if}
        </SettingsSection>
      </main>

      <footer class="app-footer" id="ytr-about">
        <p class="about-description">{t('aboutDescription')}</p>
        <div class="about-links">
          <a class="about-link" href="https://t.me/ytrewind_extension" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            <span>{t('aboutTelegram')}</span>
          </a>
          <a class="about-link" href="https://addons.mozilla.org/firefox/addon/youtube-rewind/" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8.824 7.287c.008 0 .004 0 0 0zm-2.8-1.4c.006 0 .003 0 0 0zm16.754 2.161c-.505-1.215-1.53-2.528-2.333-2.943.654 1.283 1.033 2.57 1.177 3.53l.002.02c-1.314-3.278-3.544-4.6-5.366-7.477-.091-.147-.184-.292-.273-.446a3.545 3.545 0 01-.13-.24 2.118 2.118 0 01-.172-.46.03.03 0 00-.027-.03.038.038 0 00-.021 0l-.006.001a.037.037 0 00-.01.005L15.624 0c-2.585 1.515-3.657 4.168-3.932 5.856a6.197 6.197 0 00-2.305.587.297.297 0 00-.147.37c.057.162.24.24.396.17a5.622 5.622 0 012.008-.523l.067-.005a5.847 5.847 0 011.957.222l.095.03a5.816 5.816 0 01.616.228c.08.036.16.073.238.112l.107.055a5.835 5.835 0 01.368.211 5.953 5.953 0 012.034 2.104c-.62-.437-1.733-.868-2.803-.681 4.183 2.09 3.06 9.292-2.737 9.02a5.164 5.164 0 01-1.513-.292 4.42 4.42 0 01-.538-.232c-1.42-.735-2.593-2.121-2.74-3.806 0 0 .537-2 3.845-2 .357 0 1.38-.998 1.398-1.287-.005-.095-2.029-.9-2.817-1.677-.422-.416-.622-.616-.8-.767a3.47 3.47 0 00-.301-.227 5.388 5.388 0 01-.032-2.842c-1.195.544-2.124 1.403-2.8 2.163h-.006c-.46-.584-.428-2.51-.402-2.913-.006-.025-.343.176-.389.206-.406.29-.787.616-1.136.974-.397.403-.76.839-1.085 1.303a9.816 9.816 0 00-1.562 3.52c-.003.013-.11.487-.19 1.073-.013.09-.026.181-.037.272a7.8 7.8 0 00-.069.667l-.002.034-.023.387-.001.06C.386 18.795 5.593 24 12.016 24c5.752 0 10.527-4.176 11.463-9.661.02-.149.035-.298.052-.448.232-1.994-.025-4.09-.753-5.844z"/></svg>
            <span>{t('aboutFirefox')}</span>
          </a>
          <a class="about-link" href="https://github.com/crixqq/YouTube-Rewind" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
            <span>{t('aboutGitHub')}</span>
          </a>
        </div>
        <div class="about-creator">
          {t('aboutCreator')} <a href="https://github.com/crixqq" target="_blank" rel="noopener">crixqq</a>
        </div>
        <a class="footer-link" href="https://github.com/crixqq/YouTube-Rewind/blob/main/LICENSE" target="_blank" rel="noopener">GPL-3.0</a>
      </footer>

  </div>
  {#if activeSheet}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="sheet-backdrop" onclick={(event) => { if (event.target === event.currentTarget) clearSheetState(); }}>
      <div class="sheet-card" role="dialog" aria-modal="true">
        <div class="sheet-header">
          <div class="sheet-title-wrap">
            <div class="sheet-kicker">{activeSheet === 'logo' ? t('settingCustomLogo') : activeSheet === 'profile-import' ? t('profileFromFile') : t('importSettings')}</div>
            <h2 class="sheet-title">
              {activeSheet === 'logo'
                ? t('settingCustomLogo')
                : activeSheet === 'profile-import'
                  ? t('profileFromFile')
                  : t('importSettings')}
            </h2>
          </div>
          <button class="sheet-close" onclick={clearSheetState} aria-label={t('resetCancelButton')}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="sheet-content">
          {#if activeSheet === 'import'}
            <label
              class="sheet-drop-zone"
              class:dragging={importDragging}
              ondrop={(event) => {
                event.preventDefault();
                importDragging = false;
                const file = event.dataTransfer?.files?.[0];
                if (file) void loadImportFile(file, 'import');
              }}
              ondragover={(event) => {
                event.preventDefault();
                importDragging = true;
              }}
              ondragleave={() => { importDragging = false; }}
            >
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <polyline points="9 15 12 12 15 15"/>
              </svg>
              <span class="sheet-drop-title">{t('importDrop')}</span>
              <span class="sheet-drop-hint">{t('importHint')}</span>
              <input class="sheet-file-input" type="file" accept=".json,.txt" onchange={(event) => onImportFileInput(event, 'import')} />
            </label>
            <div class="sheet-actions-row">
              <button class="action-btn" class:is-loading={importPasting} onclick={() => void pasteSettingsIntoSheet()}>
                {t('pasteClipboard')}
              </button>
            </div>
          {:else if activeSheet === 'profile-import'}
            {#if pendingProfileText}
              <div class="sheet-profile-confirm">
                <div class="sheet-field-label">{t('profileNamePlaceholder')}</div>
                <input
                  class="profile-name-input"
                  type="text"
                  placeholder={t('profileNamePlaceholder')}
                  bind:value={sheetProfileNameInput}
                  onkeydown={(event) => {
                    if (event.key === 'Enter') void confirmSheetProfileImport();
                    if (event.key === 'Escape') cancelSheetProfileImport();
                  }}
                />
                <div class="sheet-file-name">{pendingProfileFileName}</div>
                <div class="sheet-actions-row sheet-actions-end">
                  <button class="action-btn" onclick={cancelSheetProfileImport}>{t('resetCancelButton')}</button>
                  <button class="action-btn action-btn-save" onclick={() => void confirmSheetProfileImport()}>{t('profileSaveCurrent')}</button>
                </div>
              </div>
            {:else}
              <label
                class="sheet-drop-zone"
                class:dragging={importDragging}
                ondrop={(event) => {
                  event.preventDefault();
                  importDragging = false;
                  const file = event.dataTransfer?.files?.[0];
                  if (file) void loadImportFile(file, 'profile-import');
                }}
                ondragover={(event) => {
                  event.preventDefault();
                  importDragging = true;
                }}
                ondragleave={() => { importDragging = false; }}
              >
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <polyline points="9 15 12 12 15 15"/>
                </svg>
                <span class="sheet-drop-title">{t('profileFromFile')}</span>
                <span class="sheet-drop-hint">{t('importHint')}</span>
                <input class="sheet-file-input" type="file" accept=".json,.txt" onchange={(event) => onImportFileInput(event, 'profile-import')} />
              </label>
              <div class="sheet-actions-row">
                <button class="action-btn" class:is-loading={importPasting} onclick={() => void pasteProfileIntoSheet()}>
                  {t('pasteClipboard')}
                </button>
              </div>
            {/if}
          {:else if activeSheet === 'logo'}
            <label
              class="sheet-drop-zone"
              class:dragging={logoDragging}
              class:sheet-drop-zone-media={!!logoDraftUrl}
              ondrop={(event) => {
                event.preventDefault();
                logoDragging = false;
                const file = event.dataTransfer?.files?.[0];
                if (file) void processLogoFile(file);
              }}
              ondragover={(event) => {
                event.preventDefault();
                logoDragging = true;
              }}
              ondragleave={() => { logoDragging = false; }}
            >
              {#if logoDraftUrl}
                {#if isVideoLogo(logoDraftUrl)}
                  <video src={logoDraftUrl} class="sheet-logo-preview" muted autoplay loop playsinline></video>
                {:else}
                  <img src={logoDraftUrl} alt="" class="sheet-logo-preview" />
                {/if}
              {:else}
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span class="sheet-drop-title">{t('customLogoDrop')}</span>
                <span class="sheet-drop-hint">{t('customLogoHint')}</span>
              {/if}
              <input class="sheet-file-input" type="file" accept={LOGO_ACCEPT} onchange={onLogoFileInput} />
            </label>
            <div class="sheet-actions-row">
              {#if logoDraftUrl}
                <label class="action-btn action-btn-file">
                  {t('customLogoUpload')}
                  <input class="sheet-file-input" type="file" accept={LOGO_ACCEPT} onchange={onLogoFileInput} />
                </label>
              {/if}
              <button class="action-btn" class:is-loading={logoPasting} onclick={() => void pasteLogoFromClipboard()}>
                {t('pasteClipboard')}
              </button>
              {#if logoDraftUrl}
                <button class="action-btn action-btn-danger" onclick={() => void removeLogoFromSheet()}>{t('customLogoRemove')}</button>
              {/if}
            </div>
            <Slider
              label={t('settingCustomLogoSize')}
              value={settings.customLogoScale}
              min={40}
              max={220}
              formatDisplay={formatPercent}
              parseInput={parsePercent}
              onchange={(v) => update('customLogoScale', v)}
            />
            <div class="sheet-actions-row">
              <button class="action-btn" onclick={() => update('customLogoScale', 100)}>
                {t('resetSettings')}
              </button>
            </div>
          {/if}

          {#if sheetFeedback}
            <div class="sheet-feedback" class:sheet-feedback-ok={sheetFeedback.type === 'ok'} class:sheet-feedback-err={sheetFeedback.type === 'error'}>
              {sheetFeedback.text}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  :root {
    /* Material Design 3 tokens — Light */
    --md-primary: #443795;
    --md-on-primary: #ffffff;
    --md-primary-container: #e8ddff;
    --md-on-primary-container: #170065;
    --md-secondary: #625b79;
    --md-on-secondary: #ffffff;
    --md-secondary-container: #e7e0f4;
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
    --md-shape-xs: 6px;
    --md-shape-sm: 10px;
    --md-shape-md: 14px;
    --md-shape-lg: 20px;
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
    scrollbar-width: thin;
    scrollbar-color: var(--md-primary) transparent;
    scrollbar-gutter: stable both-edges;
  }

  :global(body[data-ytr-layout="page"]) {
    width: auto;
    min-height: 100vh;
    max-height: none;
    animation: none;
    transform: none !important;
    scroll-behavior: auto;
  }

  :global(body[data-ytr-layout="page"]::-webkit-scrollbar-thumb) {
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--md-primary) 78%, white 22%),
        color-mix(in srgb, var(--md-primary) 62%, white 38%)
      );
    background-size: 100% 100%;
    animation: none;
  }

  :global(#app) {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  :global(body::-webkit-scrollbar) {
    width: 10px;
  }

  :global(body::-webkit-scrollbar-thumb) {
    border-radius: var(--md-shape-full);
    border: 2px solid transparent;
    background:
      repeating-linear-gradient(
        180deg,
        color-mix(in srgb, var(--md-primary) 80%, white 20%) 0 10px,
        color-mix(in srgb, var(--md-primary) 62%, white 38%) 10px 22px,
        color-mix(in srgb, var(--md-primary) 88%, white 12%) 22px 34px
    );
    background-size: 100% 180%;
    background-position: 50% 0%;
    background-clip: content-box;
    transition: filter 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
  }

  :global(body::-webkit-scrollbar-thumb:hover) {
    filter: brightness(1.04);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--md-primary) 34%, transparent);
  }

  :global(body::-webkit-scrollbar-thumb:active) {
    filter: brightness(1.08);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--md-primary) 42%, transparent);
  }

  :global(body::-webkit-scrollbar-track) {
    background: color-mix(in srgb, var(--md-surface-container-high) 50%, transparent);
    border-radius: var(--md-shape-full);
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

  .header-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .app-logo {
    height: 30px;
    width: calc(30px * 3464 / 608);
    flex-shrink: 0;
    display: inline-block;
    user-select: none;
    -webkit-user-drag: none;
    background: var(--ytr-logo-color, var(--md-primary));
    mask: url('/logo-header.png') center / contain no-repeat;
    -webkit-mask: url('/logo-header.png') center / contain no-repeat;
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
    transition:
      transform 0.2s cubic-bezier(0.2, 0, 0, 1),
      background-color 0.2s cubic-bezier(0.2, 0, 0, 1),
      color 0.2s cubic-bezier(0.2, 0, 0, 1);
    transform-origin: center;
    backface-visibility: hidden;
  }

  .lang-button:hover {
    background: var(--md-surface-container-high);
    transform: scale(1.04);
    color: var(--md-primary);
  }

  .lang-button:active {
    background: var(--md-surface-container-highest);
    transform: scale(0.96);
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
    border: 1px solid color-mix(in srgb, var(--md-outline-variant) 82%, transparent);
    padding: 4px 0;
    z-index: 20;
    overflow-y: auto;
    overscroll-behavior: contain;
    animation: menuFadeIn 0.12s var(--md-easing-emphasized);
    transform-origin: top right;
    scrollbar-width: thin;
    scrollbar-color: var(--md-primary) transparent;
  }

  .lang-menu::-webkit-scrollbar {
    width: 8px;
  }

  .lang-menu::-webkit-scrollbar-thumb {
    border-radius: var(--md-shape-full);
    border: 2px solid transparent;
    background:
      repeating-linear-gradient(
        180deg,
        color-mix(in srgb, var(--md-primary) 80%, white 20%) 0 10px,
        color-mix(in srgb, var(--md-primary) 62%, white 38%) 10px 22px,
        color-mix(in srgb, var(--md-primary) 88%, white 12%) 22px 34px
    );
    background-size: 100% 180%;
    background-position: 50% 0%;
    background-clip: content-box;
    transition: filter 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
  }

  .lang-menu::-webkit-scrollbar-thumb:hover {
    filter: brightness(1.04);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--md-primary) 34%, transparent);
  }

  .lang-menu::-webkit-scrollbar-thumb:active {
    filter: brightness(1.08);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--md-primary) 42%, transparent);
  }

  .lang-menu::-webkit-scrollbar-track {
    background: color-mix(in srgb, var(--md-surface-container-high) 44%, transparent);
    border-radius: var(--md-shape-full);
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
    transition:
      transform 0.18s cubic-bezier(0.2, 0, 0, 1),
      background-color 0.18s cubic-bezier(0.2, 0, 0, 1),
      color 0.18s cubic-bezier(0.2, 0, 0, 1);
    text-align: left;
    position: relative;
    transform-origin: center;
    backface-visibility: hidden;
  }

  .lang-menu-item-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    align-items: flex-start;
    transition: transform 0.22s cubic-bezier(0.2, 0, 0, 1);
  }

  .lang-menu-item-label {
    font-size: 14px;
    line-height: 1.2;
  }

  .lang-menu-item-note {
    font-size: 11px;
    line-height: 1.2;
    color: var(--md-on-surface-variant);
    opacity: 0.75;
  }

  .lang-menu-item:hover {
    background: var(--md-surface-container-high);
    transform: scale(1.01);
  }

  .lang-menu-item:hover .lang-menu-item-copy {
    transform: translateY(-1px);
  }

  .lang-menu-item:active {
    background: var(--md-surface-container-highest);
    transform: scale(0.99);
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
    transition:
      transform 0.15s cubic-bezier(0.2, 0, 0, 1),
      background-color 0.15s cubic-bezier(0.2, 0, 0, 1),
      color 0.15s cubic-bezier(0.2, 0, 0, 1);
    transform-origin: center;
    backface-visibility: hidden;
  }

  .version-button:hover {
    background: var(--md-surface-container-high);
    transform: scale(1.04);
  }

  .version-button:active {
    background: var(--md-surface-container-highest);
    transform: scale(0.97);
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
    border: 1px solid color-mix(in srgb, var(--md-outline-variant) 82%, transparent);
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
    transition:
      transform 0.2s cubic-bezier(0.2, 0, 0, 1),
      background-color 0.2s cubic-bezier(0.2, 0, 0, 1),
      color 0.2s cubic-bezier(0.2, 0, 0, 1),
      opacity 0.2s cubic-bezier(0.2, 0, 0, 1);
    justify-content: center;
    line-height: 1.1;
    transform-origin: center;
    backface-visibility: hidden;
  }

  .update-download:hover {
    opacity: 0.9;
    text-decoration: none;
    transform: scale(1.02);
    background: color-mix(in srgb, var(--md-primary) 92%, white 8%);
  }

  .update-download > * {
    transition: transform 0.24s cubic-bezier(0.2, 0, 0, 1);
  }

  .update-download:hover > * {
    transform: translateY(-1px);
  }

  .update-download:active {
    transform: scale(0.98);
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
    display: block;
    object-fit: contain;
    border-radius: var(--md-shape-xs);
    border: 1px solid var(--md-outline-variant);
    transition: transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  .logo-preview:hover {
    transform: scale(1.08);
  }

  .logo-preview-rewind {
    width: calc(20px * 3464 / 608);
    max-width: none;
    border: none;
    background: var(--ytr-logo-color, var(--md-primary));
    mask: url('/logo-header.png') center / contain no-repeat;
    -webkit-mask: url('/logo-header.png') center / contain no-repeat;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 12px;
    font-family: inherit;
    line-height: 1.1;
    min-height: 32px;
    padding: 6px 14px;
    border: 1px solid var(--md-outline-variant);
    border-radius: var(--md-shape-full);
    background: transparent;
    color: var(--md-on-surface-variant);
    cursor: pointer;
    transition:
      transform 0.2s cubic-bezier(0.2, 0, 0, 1),
      background-color 0.2s cubic-bezier(0.2, 0, 0, 1),
      color 0.2s cubic-bezier(0.2, 0, 0, 1),
      border-color 0.2s cubic-bezier(0.2, 0, 0, 1),
      box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1);
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
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
    transform: scale(1.03);
  }

  .effect-option-label {
    position: relative;
    z-index: 1;
    transition: transform 0.24s cubic-bezier(0.2, 0, 0, 1);
  }

  .effect-option:hover .effect-option-label {
    transform: translateY(-1px);
  }

  .effect-option:active {
    transform: scale(0.98);
    transition-duration: 0.06s;
  }

  .effect-option.active {
    background: var(--md-primary);
    color: var(--md-on-primary);
    border-color: transparent;
    box-shadow: none;
    animation: chipSelect 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  @keyframes chipSelect {
    0% { transform: scale(0.92); }
    50% { transform: scale(1.06); }
    100% { transform: scale(1); }
  }

  .effect-option.active:hover {
    transform: scale(1.03);
  }

  .effect-option.active:active {
    transform: scale(0.98);
  }

  :global(body[data-ytr-theme-mode="light"]) .effect-option.active {
    background: color-mix(in srgb, var(--md-primary-container) 88%, white 12%);
    color: var(--md-on-primary-container);
    border-color: color-mix(in srgb, var(--md-primary) 58%, var(--md-primary-container));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--md-primary) 18%, transparent) inset,
      0 1px 2px rgba(0, 0, 0, 0.06);
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
    transform: scale(1.005);
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
    transform: scale(1.08);
  }

  .search-clear:active {
    transform: scale(0.9);
    transition-duration: 0.06s;
  }

  /* --- Profile Actions --- */

  .profile-actions-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 8px;
    animation: feedbackSlideIn var(--md-duration-short) var(--md-easing-emphasized-decel) both;
  }

  .action-btn-save {
    background: var(--md-primary);
    color: var(--md-on-primary);
    border-color: var(--md-primary);
    transition:
      transform var(--md-duration-short) var(--md-easing-standard),
      background-color var(--md-duration-short) var(--md-easing-standard),
      border-color var(--md-duration-short) var(--md-easing-standard),
      color var(--md-duration-short) var(--md-easing-standard),
      opacity var(--md-duration-short) var(--md-easing-standard);
  }

  .action-btn-save:hover {
    opacity: 0.92;
    background: var(--md-primary);
    transform: scale(1.02);
  }

  .action-btn-save:active {
    transform: scale(0.98);
  }

  .app-body {
    padding-bottom: 8px;
  }

  .app-shell-page .app-header {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--md-surface) 96%, transparent), color-mix(in srgb, var(--md-surface-container-low) 92%, transparent));
    backdrop-filter: blur(18px);
  }

  .app-shell-page .app-header,
  .app-shell-page .search-bar,
  .app-shell-page .app-footer {
    animation: none;
  }

  .app-shell-page .header-content {
    max-width: 1440px;
    margin: 0 auto;
    padding: 18px 24px;
  }

  .app-shell-page .app-logo {
    height: 34px;
    width: calc(34px * 3464 / 608);
  }

  .app-shell-page .search-bar {
    width: min(1440px, calc(100% - 48px));
    max-width: 1440px;
    margin: 16px auto 0;
    padding: 10px 16px;
  }

  .app-shell-page .app-body {
    columns: 340px;
    column-gap: 16px;
    max-width: 1440px;
    margin: 0 auto;
    padding: 16px 24px 28px;
  }

  .app-shell-page .app-body > :global(*) {
    display: inline-block;
    width: 100%;
    margin: 0 0 14px;
    break-inside: avoid;
    vertical-align: top;
    animation: none !important;
  }

  .app-shell-page .app-body :global(.settings-section) {
    padding: 0 6px 4px;
  }

  .app-shell-page .app-body :global(.section-title) {
    padding-top: 6px;
  }

  .app-shell-page .app-footer {
    max-width: 1440px;
    margin: 0 auto;
    padding: 8px 24px 28px;
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
    transform: scale(1.06);
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
    transition:
      transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28),
      background-color 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28),
      border-color 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28),
      color 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    position: relative;
    overflow: hidden;
    line-height: 1.1;
    transform-origin: center;
    backface-visibility: hidden;
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
    background: var(--md-surface-container-high);
    transform: scale(1.03);
    border-color: var(--md-outline);
    text-decoration: none;
  }

  .about-link > * {
    position: relative;
    z-index: 1;
    transition: transform 0.24s cubic-bezier(0.2, 0, 0, 1);
  }

  .about-link:hover > * {
    transform: translateY(-1px);
  }

  .about-link:hover svg {
    transform: scale(1.08);
  }

  .about-link svg {
    transition: transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    flex-shrink: 0;
  }

  .about-link:active {
    transform: scale(0.98);
    transition-duration: 0.06s;
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
    transition:
      transform 0.15s ease,
      opacity 0.15s ease,
      color 0.15s ease;
    display: inline-flex;
    align-items: center;
    line-height: 1.1;
    transform-origin: center;
    backface-visibility: hidden;
  }

  .app-footer .footer-link:hover {
    opacity: 0.8;
    text-decoration: underline;
    transform: scale(1.03);
  }

  .app-footer .footer-link:active {
    transform: scale(0.98);
  }

  /* --- Export / Import --- */

  .data-section {
    padding: 8px 12px 10px;
  }

  .interface-theme-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 16px 10px;
    flex-wrap: wrap;
  }

  .interface-theme-presets {
    gap: 8px;
  }

  .interface-theme-preset {
    gap: 8px;
    white-space: nowrap;
  }

  .interface-theme-preset > span:last-child {
    position: relative;
    z-index: 1;
  }

  .interface-theme-preset-swatch {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--md-outline-variant) 82%, transparent);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
    flex-shrink: 0;
  }

  .interface-theme-reset {
    min-height: 44px;
  }

  .data-group {
    padding: 6px 0;
  }

  .data-toggle-wrap {
    margin: 0 -12px 6px;
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
    line-height: 1.1;
    padding: 5px 12px;
    border: 1px solid var(--md-outline-variant);
    border-radius: var(--md-shape-full);
    background: transparent;
    color: var(--md-primary);
    cursor: pointer;
    transition:
      transform 0.2s cubic-bezier(0.2, 0, 0, 1),
      background-color 0.2s cubic-bezier(0.2, 0, 0, 1),
      color 0.2s cubic-bezier(0.2, 0, 0, 1),
      border-color 0.2s cubic-bezier(0.2, 0, 0, 1),
      box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1);
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
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
    background: var(--md-surface-container-high);
    transform: scale(1.03);
    border-color: var(--md-outline);
  }

  .action-btn > * {
    position: relative;
    z-index: 1;
    transition: transform 0.24s cubic-bezier(0.2, 0, 0, 1);
  }

  .action-btn:hover > * {
    transform: translateY(-1px);
  }

  .action-btn:active {
    transform: scale(0.98);
    transition-duration: 0.06s;
  }

  .action-btn.is-loading {
    opacity: 0.7;
    pointer-events: none;
  }

  .action-btn-file {
    display: inline-flex;
    align-items: center;
    justify-content: center;
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
    padding-right: 28px;
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
    right: 7px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: var(--md-shape-full);
    background: transparent;
    color: color-mix(in srgb, var(--md-on-surface-variant) 82%, transparent);
    cursor: pointer;
    opacity: 0.72;
    transition:
      transform var(--md-duration-short) var(--md-easing-standard),
      color var(--md-duration-short) var(--md-easing-standard),
      background var(--md-duration-short) var(--md-easing-standard),
      opacity var(--md-duration-short) var(--md-easing-standard);
  }

  .custom-profile-chip:hover .custom-profile-delete {
    transform: translateY(-50%) scale(1.05);
  }

  .custom-profile-chip .effect-option.active + .custom-profile-delete {
    color: color-mix(in srgb, var(--md-on-primary) 82%, transparent);
    opacity: 0.82;
  }

  .custom-profile-delete:hover {
    opacity: 1;
    color: var(--md-error);
    background: color-mix(in srgb, var(--md-error) 12%, transparent);
    transform: translateY(-50%) scale(1.14);
  }

  .custom-profile-delete:active {
    transform: translateY(-50%) scale(0.92);
    transition-duration: 0.06s;
  }

  .profile-helper {
    padding: 0 12px 8px;
    font-size: 12px;
    color: var(--md-on-surface-variant);
    opacity: 0.82;
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

  /* --- Inline Confirmations --- */

  .inline-confirm {
    margin: 8px 10px 10px;
    padding: 16px;
    border-radius: var(--md-shape-lg);
    background: var(--md-surface-container-low);
    border: 1px solid color-mix(in srgb, var(--md-outline-variant) 75%, transparent);
    animation: feedbackSlideIn var(--md-duration-short) var(--md-easing-emphasized-decel) both;
  }

  .inline-confirm-warning {
    background: var(--md-surface-container-low);
    border-color: color-mix(in srgb, var(--md-outline-variant) 75%, transparent);
  }

  .inline-confirm-danger {
    background: var(--md-surface-container-low);
    border-color: color-mix(in srgb, var(--md-outline-variant) 75%, transparent);
  }

  .inline-confirm-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--md-on-surface);
    margin-bottom: 8px;
  }

  .inline-confirm-message {
    font-size: 13px;
    line-height: 1.5;
    color: var(--md-on-surface-variant);
  }

  .inline-confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 14px;
  }

  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(17, 16, 20, 0.56);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .sheet-card {
    width: min(720px, 100%);
    max-height: calc(100vh - 48px);
    overflow: auto;
    border-radius: 32px;
    background: var(--md-surface);
    color: var(--md-on-surface);
    border: 1px solid color-mix(in srgb, var(--md-outline-variant) 72%, transparent);
  }

  .sheet-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 22px 22px 0;
  }

  .sheet-title-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sheet-kicker {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--md-primary);
  }

  .sheet-title {
    font-size: 24px;
    font-weight: 600;
    color: var(--md-on-surface);
  }

  .sheet-close {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: var(--md-shape-full);
    background: transparent;
    color: var(--md-on-surface-variant);
    cursor: pointer;
    transition: background var(--md-duration-short) var(--md-easing-standard), transform var(--md-duration-short) var(--md-easing-standard);
  }

  .sheet-close:hover {
    background: var(--md-surface-container-high);
    transform: scale(1.03);
  }

  .sheet-close:active {
    transform: scale(0.94);
  }

  .sheet-content {
    padding: 18px 22px 22px;
  }

  .sheet-drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 220px;
    padding: 24px;
    border-radius: 28px;
    background: var(--md-surface-container-low);
    border: 1px dashed color-mix(in srgb, var(--md-outline-variant) 80%, transparent);
    text-align: center;
    cursor: pointer;
    transition: border-color var(--md-duration-short) var(--md-easing-standard), background var(--md-duration-short) var(--md-easing-standard), transform var(--md-duration-short) var(--md-easing-standard);
  }

  .sheet-drop-zone.dragging {
    border-color: var(--md-primary);
    background: color-mix(in srgb, var(--md-primary-container) 55%, var(--md-surface-container-low));
    transform: scale(1.01);
  }

  .sheet-drop-zone-media {
    min-height: 170px;
  }

  .sheet-drop-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--md-on-surface);
  }

  .sheet-drop-hint {
    font-size: 13px;
    line-height: 1.5;
    color: var(--md-on-surface-variant);
  }

  .sheet-logo-preview {
    max-width: min(100%, 340px);
    max-height: 84px;
    object-fit: contain;
    border-radius: 14px;
  }

  .sheet-file-input {
    display: none;
  }

  .sheet-actions-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 14px;
  }

  .sheet-actions-inline {
    padding: 10px 10px 0;
  }

  .sheet-actions-inline > * {
    width: auto;
  }

  .sheet-actions-end {
    justify-content: flex-end;
  }

  .sheet-profile-confirm {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 0 0;
  }

  .sheet-field-label {
    font-size: 13px;
    color: var(--md-on-surface-variant);
  }

  .sheet-file-name {
    font-size: 12px;
    color: var(--md-on-surface-variant);
    opacity: 0.72;
  }

  .sheet-feedback {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: var(--md-shape-md);
    font-size: 13px;
    font-weight: 500;
  }

  .sheet-feedback-ok {
    color: #2e7d32;
    background: #e8f5e9;
  }

  .sheet-feedback-err {
    color: var(--md-error);
    background: rgba(186, 26, 26, 0.08);
  }

  .action-btn-danger {
    color: var(--md-error);
    border-color: var(--md-error);
  }

  .action-btn-danger:hover {
    background: rgba(186, 26, 26, 0.08);
    transform: scale(1.03);
  }

  .action-btn-danger:active {
    transform: scale(0.98);
    transition-duration: 0.06s;
  }

  @media (prefers-color-scheme: dark) {
    .sheet-feedback-ok {
      color: #81c784;
      background: rgba(129, 199, 132, 0.12);
    }
    .action-btn-danger:hover {
      background: rgba(255, 180, 171, 0.08);
    }
  }

  @media (max-width: 760px) {
    .app-shell-page .header-content,
    .app-shell-page .app-body,
    .app-shell-page .app-footer {
      padding-left: 16px;
      padding-right: 16px;
    }

    .app-shell-page .app-body {
      columns: 1;
    }

    .app-shell-page .search-bar {
      width: calc(100% - 32px);
    }

    .sheet-backdrop {
      padding: 12px;
      align-items: flex-end;
    }

    .sheet-card {
      width: 100%;
      max-height: min(88vh, 760px);
      border-radius: 28px 28px 0 0;
    }

    .sheet-header,
    .sheet-content {
      padding-left: 16px;
      padding-right: 16px;
    }

    .sheet-actions-row,
    .inline-confirm-actions {
      flex-direction: column;
    }

    .sheet-actions-row > *,
    .inline-confirm-actions > * {
      width: 100%;
      justify-content: center;
    }

    .sheet-actions-inline {
      flex-direction: row;
    }

    .sheet-actions-inline > * {
      width: auto;
    }
  }

</style>
