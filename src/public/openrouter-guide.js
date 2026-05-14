const STORAGE_KEY = 'ytr_settings';
const DEFAULT_SETTINGS = {
  language: 'auto',
  interfaceThemeMode: 'auto',
  interfaceThemeColor: '#c8bfff',
  aiVideoChatProvider: 'openrouter',
  aiVideoChatApiKey: '',
  aiVideoChatModel: 'openrouter/free',
  aiVideoChatCustomModel: '',
  aiVideoChatSystemPreset: 'balanced',
  aiVideoChatCustomSystemPrompt: '',
  aiVideoChatTemperature: 0.2,
  aiVideoChatSavedPrompts: [],
  aiVideoChatAutoOpen: true,
  aiVideoChatUseWeb: true,
  aiVideoChatUseChannelContext: true,
  aiVideoChatDeepLinkInspection: true,
  aiVideoChatMaxWebSnippets: 8,
  aiVideoChatMaxYouTubeLinks: 8,
  aiVideoChatResponseLanguage: 'auto',
  aiVideoChatAdultMode: 'brief',
  aiVideoChatMaxTokens: 700,
  aiVideoChatReasoningDepth: 'balanced',
};

const MODEL_PRESETS_BY_PROVIDER = {
  openrouter: [
    ['openrouter/free', 'OpenRouter Free Router'],
    ['openai/gpt-oss-120b:free', 'OpenAI GPT-OSS 120B'],
    ['qwen/qwen3-next-80b-a3b-instruct:free', 'Qwen3 Next 80B'],
    ['google/gemma-4-31b-it:free', 'Gemma 4 31B'],
    ['custom', 'Custom'],
  ],
  openai: [
    ['gpt-4.1-mini', 'GPT-4.1 mini'],
    ['gpt-4o-mini', 'GPT-4o mini'],
    ['gpt-4.1', 'GPT-4.1'],
    ['custom', 'Custom'],
  ],
  anthropic: [
    ['claude-3-5-haiku-20241022', 'Claude 3.5 Haiku'],
    ['claude-sonnet-4-20250514', 'Claude Sonnet 4'],
    ['claude-3-7-sonnet-20250219', 'Claude 3.7 Sonnet'],
    ['custom', 'Custom'],
  ],
  perplexity: [
    ['sonar', 'Sonar'],
    ['sonar-pro', 'Sonar Pro'],
    ['sonar-reasoning-pro', 'Sonar Reasoning Pro'],
    ['custom', 'Custom'],
  ],
};

const browserApi = typeof browser !== 'undefined' ? browser : null;
const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
const runtimeApi = browserApi?.runtime || chromeApi?.runtime || null;
let currentLanguage = 'auto';
let isRuLocale = /^ru\b/i.test(navigator.language || '');
let activeSavedPromptName = '';
let autoSaveTimer = 0;
let isSyncingForm = false;
let sliderAnimationFrame = 0;
let sliderLastFrameTime = 0;
const sliderAnimationState = new Map();

const PROVIDERS = [
  ['openrouter', 'OpenRouter', 'provider-icon-openrouter'],
  ['openai', 'ChatGPT / OpenAI', 'provider-icon-openai'],
  ['anthropic', 'Claude', 'provider-icon-anthropic'],
  ['perplexity', 'Perplexity', 'provider-icon-perplexity'],
];

const LANGUAGES = [
  ['auto', 'Auto'],
  ['en', 'English'],
  ['ru', 'Русский'],
  ['uk', 'Українська'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['tr', 'Türkçe'],
  ['it', 'Italiano'],
  ['pl', 'Polski'],
  ['nl', 'Nederlands'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['zh', '中文'],
];

const RESPONSE_LANGUAGES = LANGUAGES;

const MODEL_ICON_DOMAINS = {
  openrouter: 'openrouter.ai',
  openai: 'openai.com',
  anthropic: 'claude.ai',
  perplexity: 'perplexity.ai',
  qwen: 'qwenlm.ai',
  google: 'google.com',
};

const I18N = {
  en: {
    sectionAbout: 'About',
    searchLabel: 'Assistant provider, model, prompt and generation settings',
    sectionProvider: 'Provider',
    apiKey: 'API key',
    sectionModel: 'Model',
    customModelId: 'Custom model ID',
    sectionAnswerStyle: 'Answer style',
    styleBalanced: 'Balanced',
    styleConcise: 'Concise',
    styleDeep: 'Deep context',
    systemPrompt: 'System prompt',
    systemPromptPlaceholder: 'Assistant instructions...',
    temperature: 'Temperature',
    responseLanguage: 'Response language',
    responseLanguageAuto: 'Auto',
    maxTokens: 'Answer length limit',
    adultMode: '18+ and sensitive content',
    adultModeHide: 'Avoid',
    adultModeBrief: 'Brief context',
    adultModeAllow: 'Allowed when asked',
    reasoningDepth: 'Context depth',
    reasoningFast: 'Fast',
    reasoningBalanced: 'Balanced',
    reasoningDeep: 'Deep',
    savePromptAs: 'Save current prompt as',
    savePromptPlaceholder: 'My assistant style',
    saveAsStyle: 'Save as style',
    renameStyle: 'Rename style',
    deleteStyle: 'Delete style',
    resetPrompt: 'Reset prompt',
    sectionBehavior: 'Behavior',
    autoOpenTitle: 'Open assistant automatically',
    autoOpenDescription: 'Show the chat panel on watch pages when the feature is enabled.',
    useWebTitle: 'Use web search',
    useWebDescription: 'Look up fresh terms, people, conflicts, memes and source pages when useful.',
    channelContextTitle: 'Use channel context',
    channelContextDescription: 'Add channel/profile context when the question needs identity or background.',
    deepLinksTitle: 'Inspect source links deeply',
    deepLinksDescription: 'Follow original/source YouTube links from the description for multi-step answers.',
    webSnippets: 'Web snippets',
    youtubeLinks: 'YouTube links to inspect',
    close: 'Close',
    saved: 'Saved',
    saveError: 'Could not save',
    promptSaved: 'Prompt saved',
    promptRenamed: 'Style renamed',
    promptDeleted: 'Style deleted',
    promptRequired: 'Name and prompt are required',
    newStyleName: 'New style name',
    aboutDescription: "Hide clutter, filter content and refresh YouTube's look.",
    aboutTelegram: 'Telegram',
    aboutFirefox: 'Firefox Add-ons',
    aboutChrome: 'Chrome Web Store',
    aboutGitHub: 'GitHub',
    aboutCreator: 'Created by',
    updateChecking: 'Checking for updates...',
    updateAvailable: 'Version {version} is available',
    updateOpen: 'Open release',
    updateCurrent: 'You are up to date',
    updateError: 'Could not check the version',
    updateErrorNote: 'Try again later or open GitHub releases manually.',
    langAuto: 'Auto',
  },
  ru: {
    sectionAbout: 'О расширении',
    searchLabel: 'Провайдер, модель, промпт и параметры генерации ассистента',
    sectionProvider: 'Провайдер',
    apiKey: 'API-ключ',
    sectionModel: 'Модель',
    customModelId: 'ID своей модели',
    sectionAnswerStyle: 'Стиль ответа',
    styleBalanced: 'Сбалансированный',
    styleConcise: 'Краткий',
    styleDeep: 'Глубокий контекст',
    systemPrompt: 'Системный промпт',
    systemPromptPlaceholder: 'Инструкции ассистента...',
    temperature: 'Температура',
    responseLanguage: 'Язык ответа',
    responseLanguageAuto: 'Авто',
    maxTokens: 'Лимит длины ответа',
    adultMode: '18+ и чувствительный контент',
    adultModeHide: 'Избегать',
    adultModeBrief: 'Краткий контекст',
    adultModeAllow: 'Разрешать по запросу',
    reasoningDepth: 'Глубина контекста',
    reasoningFast: 'Быстро',
    reasoningBalanced: 'Сбалансированно',
    reasoningDeep: 'Глубоко',
    savePromptAs: 'Сохранить текущий промпт как',
    savePromptPlaceholder: 'Мой стиль ассистента',
    saveAsStyle: 'Сохранить стиль',
    renameStyle: 'Переименовать стиль',
    deleteStyle: 'Удалить стиль',
    resetPrompt: 'Сбросить промпт',
    sectionBehavior: 'Поведение',
    autoOpenTitle: 'Открывать ассистента автоматически',
    autoOpenDescription: 'Показывать чат на страницах видео, когда функция включена.',
    useWebTitle: 'Использовать веб-поиск',
    useWebDescription: 'Искать свежий контекст по терминам, людям, конфликтам, мемам и источникам.',
    channelContextTitle: 'Использовать контекст канала',
    channelContextDescription: 'Добавлять контекст канала, когда вопросу нужна личность или фон.',
    deepLinksTitle: 'Глубоко проверять ссылки-источники',
    deepLinksDescription: 'Переходить по оригиналам и источникам из описания для многоходовых ответов.',
    webSnippets: 'Веб-фрагменты',
    youtubeLinks: 'Ссылки YouTube для проверки',
    close: 'Закрыть',
    saved: 'Сохранено',
    saveError: 'Не удалось сохранить',
    promptSaved: 'Промпт сохранён',
    promptRenamed: 'Стиль переименован',
    promptDeleted: 'Стиль удалён',
    promptRequired: 'Нужны название и промпт',
    newStyleName: 'Новое название стиля',
    aboutDescription: 'Убирай лишнее, фильтруй контент и освежай внешний вид YouTube.',
    aboutTelegram: 'Telegram',
    aboutFirefox: 'Firefox Add-ons',
    aboutChrome: 'Chrome Web Store',
    aboutGitHub: 'GitHub',
    aboutCreator: 'Создано',
    updateChecking: 'Проверяю обновления...',
    updateAvailable: 'Доступна версия {version}',
    updateOpen: 'Открыть релиз',
    updateCurrent: 'Установлена последняя версия',
    updateError: 'Не удалось проверить версию',
    updateErrorNote: 'Попробуй позже или открой GitHub releases вручную.',
    langAuto: 'Авто',
  },
};

function t(key, params = {}) {
  const table = isRuLocale ? I18N.ru : I18N.en;
  let value = table[key] || I18N.en[key] || key;
  Object.entries(params).forEach(([name, replacement]) => {
    value = value.replaceAll(`{${name}}`, String(replacement));
  });
  return value;
}

const BASE_SYSTEM_PROMPT = 'You are an assistant for a specific YouTube video. Write naturally and keep conversation context. Think like a careful web researcher: when the user asks for people, socials, sources, originals, conflicts, slang, memes, music formats, or claims, do multi-step context work before answering. Use the current video title, channel, description, links, comments, linked YouTube videos, YouTube/Gemini summary when present, channel information, web snippets, and recent messages before making assumptions. For web research, do not send the user question verbatim: extract entities, roles, video/channel names, and create short precise search queries. First resolve who the user means: current uploader, clipper/reuploader, streamer/reactor, person from the original video, brand, advertiser, or another named participant. Never substitute the requested person with uploader/channel socials. If the user asks for socials of a streamer/person from the original/reaction source, do not include clipper/uploader socials in the answer except in a separate clearly labeled "uploader/clipper" note when useful. If the description separates sections such as creator/uploader, streamer, original, author, ad, merch, announcements, or donations, preserve those groups and do not merge them. If the current video is a reaction/clip/reupload and the user asks about someone from the reacted-to/original video, inspect original/source links from the description first; keep the original video link as a labeled Markdown link such as [video title](https://youtube.com/watch?v=...) when useful. If no original link is present, search for the original using the title, description, and source phrases. Use Markdown links as [channel/video/page name](https://example.com), never bare URLs when a label exists, and never add spaces inside URLs. For YouTube links from the description, use the visible chip/text/title as the link label instead of printing a separate URL. Use tables only when the user asks for a table/comparison; otherwise use short grouped bullets or paragraphs. Do not write file-style Markdown headings like ### Title. If the user asks for socials, contacts, or description links, copy service names, labels, handles, and URLs exactly from the description: do not translate Telegram, Twitch, Boosty, TikTok, Discord, VK, Rutube, or @handles. Separate personal/creator socials from advertising, marketplaces, stream platforms, donations, stores, merch, announcements, and generic services. A link is a creator social only when the label/domain/content clearly belongs to that person/channel. Generic links like w.tv, stores, donations, or ad services are not personal socials unless ownership is explicit. Verify slang, memes, music formats, covers, originals, people, organizations, and news against fresh context. Type beat usually means an instrumental in the style of named artists, not necessarily produced by them. VTuber/Витубер is usually a streamer type with a virtual avatar, not a proper name unless context proves otherwise. Viewer comments are questions/opinions, not facts about the video: do not turn one comment into an event or personal story unless sources confirm it. Do not invent facts; say when something is inferred from title/description rather than proven by sources. Ignore sponsorships unless the user asks about ads. If timestamps are present, use them as an outline but do not list every timestamp unless asked for chapters. If this is a reaction, clip, cover, or reupload, briefly name the format and source, but make the main answer about the video content and user request rather than originality.';

function buildSystemPromptForPreset(preset = DEFAULT_SETTINGS.aiVideoChatSystemPreset) {
  const style = preset === 'concise'
    ? 'Style: concise, direct, no filler.'
    : preset === 'deep'
      ? 'Style: analyze context, causes, and relationships more deeply, without long disclaimers.'
      : preset === 'custom'
        ? 'Style: follow this custom prompt exactly unless it conflicts with safety or the current video context.'
        : 'Style: balanced, helpful, and natural.';
  return `${BASE_SYSTEM_PROMPT}\n\n${style}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampPercent(value, min, max) {
  return clamp(value, min, max);
}

function parseHexColor(value) {
  const match = /^#([0-9a-f]{6})$/i.exec((value || '').trim());
  if (!match) return null;
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
}

function getSeedThemeColor(value = DEFAULT_SETTINGS.interfaceThemeColor) {
  return parseHexColor(value || '') ? value.toLowerCase() : DEFAULT_SETTINGS.interfaceThemeColor;
}

function hexChannel(value) {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
}

function hexFromRgb(red, green, blue) {
  return `#${hexChannel(red)}${hexChannel(green)}${hexChannel(blue)}`;
}

function rgbToHsl(red, green, blue) {
  const r = clamp(red, 0, 255) / 255;
  const g = clamp(green, 0, 255) / 255;
  const b = clamp(blue, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);

  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;

  return {
    h: ((hue * 60) + 360) % 360,
    s: saturation,
    l: lightness,
  };
}

function hueToRgb(p, q, t) {
  let normalized = t;
  if (normalized < 0) normalized += 1;
  if (normalized > 1) normalized -= 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
}

function hexFromHsl(hue, saturation, lightness) {
  const normalizedHue = ((hue % 360) + 360) % 360 / 360;
  const normalizedSaturation = clamp(saturation, 0, 100) / 100;
  const normalizedLightness = clamp(lightness, 0, 100) / 100;

  if (normalizedSaturation === 0) {
    const channel = normalizedLightness * 255;
    return hexFromRgb(channel, channel, channel);
  }

  const q = normalizedLightness < 0.5
    ? normalizedLightness * (1 + normalizedSaturation)
    : normalizedLightness + normalizedSaturation - normalizedLightness * normalizedSaturation;
  const p = 2 * normalizedLightness - q;

  return hexFromRgb(
    hueToRgb(p, q, normalizedHue + 1 / 3) * 255,
    hueToRgb(p, q, normalizedHue) * 255,
    hueToRgb(p, q, normalizedHue - 1 / 3) * 255,
  );
}

function mixHexColors(first, second, ratio = 0.5) {
  const a = parseHexColor(first);
  const b = parseHexColor(second);
  if (!a || !b) return first;
  const weight = clamp(ratio, 0, 1);
  return hexFromRgb(
    a[0] * weight + b[0] * (1 - weight),
    a[1] * weight + b[1] * (1 - weight),
    a[2] * weight + b[2] * (1 - weight),
  );
}

function normalizeThemeSeedColor(color) {
  const rgb = parseHexColor(getSeedThemeColor(color));
  if (!rgb) return DEFAULT_SETTINGS.interfaceThemeColor;

  const original = hexFromRgb(rgb[0], rgb[1], rgb[2]).toLowerCase();
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  if (hsl.s >= 0.06 && hsl.l >= 0.22 && hsl.l <= 0.92) {
    return original;
  }

  const saturation = hsl.s < 0.06 ? 0.08 : hsl.s;
  const lightness = clamp(hsl.l, 0.22, 0.92);
  return hexFromHsl(hsl.h, saturation * 100, lightness * 100);
}

function sanitizeThemeSeedColor(mode, color) {
  const rgb = parseHexColor(normalizeThemeSeedColor(color));
  if (!rgb) return DEFAULT_SETTINGS.interfaceThemeColor;

  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const saturation = hsl.s < 0.08 ? 0.18 : hsl.s;
  const lightness = mode === 'dark'
    ? clamp(hsl.l, 0.58, 0.92)
    : clamp(hsl.l, 0.16, 0.9);

  return hexFromHsl(hsl.h, saturation * 100, lightness * 100);
}

function getThemePrimaryColor(mode, seedColor = DEFAULT_SETTINGS.interfaceThemeColor) {
  const rgb = parseHexColor(seedColor) || parseHexColor(DEFAULT_SETTINGS.interfaceThemeColor);
  if (!rgb) return DEFAULT_SETTINGS.interfaceThemeColor;

  const { h, s } = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  if (mode === 'light') {
    return hexFromHsl(h, clamp(s * 100 * 0.46, 34, 56), 40);
  }

  return sanitizeThemeSeedColor('dark', seedColor);
}

function hslColor(hue, saturation, lightness) {
  return hexFromHsl(hue, saturation, lightness);
}

function resolveThemeMode(modeSetting, prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches) {
  if (modeSetting === 'dark' || modeSetting === 'light') return modeSetting;
  return prefersDark ? 'dark' : 'light';
}

function buildInterfaceTheme(mode, seedColor) {
  const accentSeed = sanitizeThemeSeedColor(mode, seedColor);
  const rgb = parseHexColor(accentSeed) || parseHexColor(DEFAULT_SETTINGS.interfaceThemeColor);
  if (!rgb) return {};

  const { h: accentHue, s: accentSaturation } = rgbToHsl(rgb[0], rgb[1], rgb[2]);
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
      '--md-secondary-container': secondaryContainer,
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
      '--ytr-secondary': secondary,
    };
  }

  return {
    '--md-primary': primary,
    '--md-on-primary': hexFromHsl(accentHue, clampPercent(accentSaturation * 100 * 0.42, 24, 48), 21),
    '--md-primary-container': primaryContainer,
    '--md-secondary-container': secondaryContainer,
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
    '--ytr-secondary': secondary,
  };
}

async function loadStoredSettings() {
  try {
    if (browserApi?.storage?.local?.get) {
      const stored = await browserApi.storage.local.get(STORAGE_KEY);
      return stored?.[STORAGE_KEY] || {};
    }

    if (chromeApi?.storage?.local?.get) {
      return await new Promise((resolve) => {
        chromeApi.storage.local.get(STORAGE_KEY, (stored) => {
          resolve(stored?.[STORAGE_KEY] || {});
        });
      });
    }
  } catch {}

  return {};
}

async function saveStoredSettings(patch) {
  const current = await loadStoredSettings();
  const next = { ...current, ...patch };

  if (browserApi?.storage?.local?.set) {
    await browserApi.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  }

  if (chromeApi?.storage?.local?.set) {
    await new Promise((resolve) => chromeApi.storage.local.set({ [STORAGE_KEY]: next }, resolve));
  }

  return next;
}

function applyInterfaceTheme(settings = {}) {
  const mode = resolveThemeMode(settings.interfaceThemeMode || DEFAULT_SETTINGS.interfaceThemeMode);
  const tokens = buildInterfaceTheme(mode, getSeedThemeColor(settings.interfaceThemeColor || DEFAULT_SETTINGS.interfaceThemeColor));
  const root = document.documentElement;

  Object.entries(tokens).forEach(([token, value]) => {
    root.style.setProperty(token, value);
  });

  root.style.colorScheme = mode;
  root.dataset.ytrThemeMode = mode;
}

function syncBrandLogo() {
  const logo = document.querySelector('[data-role="brand-logo"]');
  if (!(logo instanceof HTMLImageElement)) return;
  logo.src = runtimeApi?.getURL ? runtimeApi.getURL('logo-header.png') : './logo-header.png';
}

function resolveLanguage(language = 'auto') {
  if (language === 'ru') return 'ru';
  if (language === 'en') return 'en';
  const browserLanguage = navigator.language || 'en';
  return /^ru\b/i.test(browserLanguage) ? 'ru' : 'en';
}

function updateLocale(language = 'auto') {
  currentLanguage = language || 'auto';
  isRuLocale = resolveLanguage(currentLanguage) === 'ru';
  document.documentElement.lang = isRuLocale ? 'ru' : 'en';
}

function getLanguageDisplayName(langId, includeLocalized = true) {
  if (langId === 'auto') return t('langAuto');
  const native = LANGUAGES.find(([id]) => id === langId)?.[1] || langId;
  if (!includeLocalized) return native;
  try {
    const displayNames = new Intl.DisplayNames([isRuLocale ? 'ru' : 'en'], { type: 'language' });
    const localized = displayNames.of(langId);
    if (!localized || localized.toLowerCase() === native.toLowerCase()) return native;
    return `${native} (${localized.charAt(0).toUpperCase()}${localized.slice(1)})`;
  } catch {
    return native;
  }
}

function getLanguageLocalizedLabel(langId) {
  if (langId === 'auto') return '';
  const native = LANGUAGES.find(([id]) => id === langId)?.[1] || langId;
  try {
    const displayNames = new Intl.DisplayNames([isRuLocale ? 'ru' : 'en'], { type: 'language' });
    const localized = displayNames.of(langId);
    if (!localized || localized.toLowerCase() === native.toLowerCase()) return '';
    return `${localized.charAt(0).toUpperCase()}${localized.slice(1)}`;
  } catch {
    return '';
  }
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (key) node.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    const key = node.getAttribute('data-i18n-placeholder');
    if (key && (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
      node.placeholder = t(key);
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach((node) => {
    const key = node.getAttribute('data-i18n-title');
    if (key) node.setAttribute('title', t(key));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    const key = node.getAttribute('data-i18n-aria');
    if (key) node.setAttribute('aria-label', t(key));
  });
  document.title = isRuLocale ? 'Настройки Video Sense AI' : 'Video Sense AI Settings';
}

function renderLanguageMenu() {
  const menu = document.querySelector('[data-role="lang-menu"]');
  const button = document.querySelector('[data-role="lang-button"]');
  if (!(menu instanceof HTMLElement)) return;
  menu.replaceChildren();
  LANGUAGES.forEach(([id]) => {
    const item = document.createElement('button');
    item.className = 'lang-menu-item';
    if (currentLanguage === id) item.classList.add('active');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.innerHTML = `
      <span class="lang-menu-item-copy">
        <span class="lang-menu-item-label"></span>
        <span class="lang-menu-item-note"></span>
      </span>
      ${currentLanguage === id ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
    `;
    item.querySelector('.lang-menu-item-label').textContent = getLanguageDisplayName(id, false);
    const note = item.querySelector('.lang-menu-item-note');
    if (note instanceof HTMLElement) {
      const label = getLanguageLocalizedLabel(id);
      note.textContent = label;
      note.hidden = !label;
    }
    item.addEventListener('click', () => void selectLanguage(id));
    menu.appendChild(item);
  });
  if (button instanceof HTMLButtonElement) {
    button.title = getLanguageDisplayName(currentLanguage);
    button.setAttribute('aria-expanded', String(!menu.hidden));
  }
}

function populateResponseLanguageSelect(selectedLanguage = DEFAULT_SETTINGS.aiVideoChatResponseLanguage) {
  const select = document.querySelector('[data-setting="aiVideoChatResponseLanguage"]');
  if (!(select instanceof HTMLSelectElement)) return;
  const normalized = RESPONSE_LANGUAGES.some(([id]) => id === selectedLanguage)
    ? selectedLanguage
    : DEFAULT_SETTINGS.aiVideoChatResponseLanguage;
  select.replaceChildren();
  RESPONSE_LANGUAGES.forEach(([id]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id === 'auto' ? t('responseLanguageAuto') : getLanguageDisplayName(id);
    select.appendChild(option);
  });
  select.value = normalized;
}

async function selectLanguage(language) {
  updateLocale(language);
  applyTranslations();
  renderLanguageMenu();
  populateResponseLanguageSelect(
    window.__ytrAiSettings?.aiVideoChatResponseLanguage || DEFAULT_SETTINGS.aiVideoChatResponseLanguage,
  );
  updateProviderGuideLink(getChoiceValue('aiVideoChatProvider', DEFAULT_SETTINGS.aiVideoChatProvider));
  await saveStoredSettings({ language });
  showSettingsStatus(t('saved'));
}

function subscribeToSettingsChanges(handleChange) {
  if (browserApi?.storage?.onChanged?.addListener) {
    browserApi.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes?.[STORAGE_KEY]?.newValue) return;
      handleChange(changes[STORAGE_KEY].newValue || {});
    });
    return;
  }

  if (chromeApi?.storage?.onChanged?.addListener) {
    chromeApi.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes?.[STORAGE_KEY]?.newValue) return;
      handleChange(changes[STORAGE_KEY].newValue || {});
    });
  }
}

function setChoiceValue(setting, value) {
  const group = document.querySelector(`[data-choice-group="${setting}"]`);
  if (!(group instanceof HTMLElement)) return;
  group.querySelectorAll('[data-value]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.setAttribute('aria-pressed', String(button.dataset.value === value));
  });
}

function clampTemperature(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SETTINGS.aiVideoChatTemperature;
  return Math.min(2, Math.max(0, Math.round(numeric * 100) / 100));
}

function clampInteger(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function getSliderBounds(key) {
  if (key === 'aiVideoChatTemperature') return { min: 0, max: 2, step: 0.05, fallback: DEFAULT_SETTINGS.aiVideoChatTemperature, decimals: 2 };
  if (key === 'aiVideoChatMaxWebSnippets') return { min: 2, max: 12, step: 1, fallback: DEFAULT_SETTINGS.aiVideoChatMaxWebSnippets, decimals: 0 };
  if (key === 'aiVideoChatMaxYouTubeLinks') return { min: 2, max: 12, step: 1, fallback: DEFAULT_SETTINGS.aiVideoChatMaxYouTubeLinks, decimals: 0 };
  if (key === 'aiVideoChatMaxTokens') return { min: 300, max: 1600, step: 50, fallback: DEFAULT_SETTINGS.aiVideoChatMaxTokens, decimals: 0 };
  return { min: 0, max: 100, step: 1, fallback: 0, decimals: 0 };
}

function clampSliderValue(key, value) {
  const bounds = getSliderBounds(key);
  const numeric = Number(String(value).replace(',', '.'));
  const base = Number.isFinite(numeric) ? numeric : bounds.fallback;
  const stepped = Math.round(base / bounds.step) * bounds.step;
  const clamped = clamp(stepped, bounds.min, bounds.max);
  return Number(clamped.toFixed(bounds.decimals));
}

function formatSliderValue(key, value) {
  const bounds = getSliderBounds(key);
  const clamped = clampSliderValue(key, value);
  if (bounds.decimals === 0) return String(Math.round(clamped));
  return String(Number(clamped.toFixed(bounds.decimals)));
}

function updateSliderVisual(control, key, value) {
  const state = sliderAnimationState.get(key) || { phase: 0, hover: false, press: false };
  const bounds = getSliderBounds(key);
  const clamped = clampSliderValue(key, value);
  const percent = bounds.max === bounds.min ? 0 : ((clamped - bounds.min) / (bounds.max - bounds.min)) * 100;
  control.style.setProperty('--slider-percent', `${percent}%`);
  const lift = state.press ? 28 : state.hover ? 18 : 0;
  const thumbSize = state.press ? 24 : state.hover ? 22 : 20;
  control.style.setProperty('--slider-thumb-lift', `${lift}%`);
  control.style.setProperty('--slider-thumb-size', `${thumbSize}px`);
  const range = control.querySelector(`[data-slider-range="${key}"]`);
  const input = control.querySelector(`[data-slider-input="${key}"]`);
  if (range instanceof HTMLInputElement) range.value = String(clamped);
  if (input instanceof HTMLInputElement && document.activeElement !== input) input.value = formatSliderValue(key, clamped);

  const wave = control.querySelector('[data-slider-wave]');
  const inactive = control.querySelector('[data-slider-inactive]');
  const track = control.querySelector('.ytr-slider-track');
  const svg = control.querySelector('.ytr-slider-svg');
  const width = Math.max(1, Math.round((track instanceof HTMLElement ? track.clientWidth : 0) || 300));
  if (svg instanceof SVGSVGElement) {
    svg.setAttribute('viewBox', `0 0 ${width} 24`);
  }
  const centerX = (percent / 100) * width;
  const activeWidth = Math.max(0, centerX - 17);
  if (wave instanceof SVGPathElement) {
    if (activeWidth <= 4) {
      wave.setAttribute('d', '');
    } else {
      const points = [];
      const amplitude = state.press ? 3.6 : state.hover ? 3.1 : 2.5;
      for (let x = 3; x <= activeWidth; x += 1.5) {
        const y = 12 + amplitude * Math.sin(((x + state.phase) / 38) * Math.PI * 2);
        points.push(`${points.length ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      wave.setAttribute('d', points.join(' '));
    }
  }
  if (inactive instanceof SVGLineElement) {
    inactive.setAttribute('x1', String(Math.min(width, centerX + 17)));
    inactive.setAttribute('x2', String(width - 3));
  }
}

function syncSliderControl(key, value) {
  const control = document.querySelector(`[data-slider-control="${key}"]`);
  if (control instanceof HTMLElement) updateSliderVisual(control, key, value);
}

function getSliderCurrentValue(key) {
  const range = document.querySelector(`[data-slider-range="${key}"]`);
  if (range instanceof HTMLInputElement) return range.value;
  const input = document.querySelector(`[data-slider-input="${key}"]`);
  return input instanceof HTMLInputElement ? input.value : getSliderBounds(key).fallback;
}

function startSliderAnimationLoop() {
  if (sliderAnimationFrame) return;
  sliderLastFrameTime = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, Math.max(0, (now - sliderLastFrameTime) / 1000));
    sliderLastFrameTime = now;
    document.querySelectorAll('[data-slider-control]').forEach((control) => {
      if (!(control instanceof HTMLElement)) return;
      const key = control.dataset.sliderControl;
      if (!key) return;
      const state = sliderAnimationState.get(key) || { phase: 0, hover: false, press: false };
      const speed = 7 + (state.hover ? 8 : 0) + (state.press ? 16 : 0);
      state.phase += dt * speed;
      sliderAnimationState.set(key, state);
      updateSliderVisual(control, key, getSliderCurrentValue(key));
    });
    sliderAnimationFrame = window.requestAnimationFrame(tick);
  };
  sliderAnimationFrame = window.requestAnimationFrame(tick);
}

function getChoiceValue(setting, fallback = '') {
  const pressed = document.querySelector(`[data-choice-group="${setting}"] [aria-pressed="true"]`);
  return pressed instanceof HTMLButtonElement ? pressed.dataset.value || fallback : fallback;
}

function fillModelChoices(provider, selectedModel) {
  const modelGroup = document.querySelector('[data-choice-group="aiVideoChatModel"]');
  if (!(modelGroup instanceof HTMLElement)) return;
  const presets = MODEL_PRESETS_BY_PROVIDER[provider] || MODEL_PRESETS_BY_PROVIDER.openrouter;
  modelGroup.replaceChildren();
  presets.forEach(([id, label]) => {
    const button = document.createElement('button');
    button.className = 'choice';
    button.type = 'button';
    button.dataset.value = id;
    button.textContent = label;
    button.addEventListener('click', () => {
      setChoiceValue('aiVideoChatModel', id);
      syncAiSettingsForm({ ...(window.__ytrAiSettings || {}), ...collectAiSettingsFormPatch() });
      scheduleAutoSave();
    });
    modelGroup.appendChild(button);
  });
  setChoiceValue('aiVideoChatModel', presets.some(([id]) => id === selectedModel) ? selectedModel : presets[0][0]);
}

function syncAutoTextarea(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  textarea.style.height = 'auto';
  const maxHeight = textarea.id === 'ai-prompt' ? 360 : 520;
  const minHeight = textarea.id === 'ai-prompt' ? 180 : 128;
  textarea.style.height = `${Math.min(maxHeight, Math.max(minHeight, textarea.scrollHeight))}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function renderPromptPresets(settings) {
  const host = document.querySelector('[data-role="prompt-presets"]');
  if (!(host instanceof HTMLElement)) return;
  host.replaceChildren();
  const presets = Array.isArray(settings.aiVideoChatSavedPrompts) ? settings.aiVideoChatSavedPrompts : [];
  presets.slice(0, 12).forEach((preset) => {
    if (!preset || typeof preset.name !== 'string' || typeof preset.prompt !== 'string') return;
    const button = document.createElement('button');
    button.className = 'choice';
    button.type = 'button';
    button.textContent = preset.name;
    button.dataset.savedPrompt = preset.name;
    button.setAttribute('aria-pressed', String(activeSavedPromptName === preset.name));
    button.addEventListener('click', () => {
      const promptField = document.querySelector('[data-setting="aiVideoChatCustomSystemPrompt"]');
      if (promptField instanceof HTMLTextAreaElement) {
        promptField.value = preset.prompt;
        syncAutoTextarea(promptField);
      }
      activeSavedPromptName = preset.name;
      setChoiceValue('aiVideoChatSystemPreset', '');
      syncPromptActions();
    });
    host.appendChild(button);
  });
}

function getCurrentPromptText() {
  const promptField = document.querySelector('[data-setting="aiVideoChatCustomSystemPrompt"]');
  return promptField instanceof HTMLTextAreaElement ? promptField.value.trim() : '';
}

function getSelectedPresetDefaultPrompt() {
  return buildSystemPromptForPreset(getChoiceValue('aiVideoChatSystemPreset', DEFAULT_SETTINGS.aiVideoChatSystemPreset));
}

function getSavedPromptMatch(settings, prompt) {
  const presets = Array.isArray(settings.aiVideoChatSavedPrompts) ? settings.aiVideoChatSavedPrompts : [];
  return presets.find((entry) => entry?.prompt?.trim() === prompt.trim()) || null;
}

function syncPromptActions(settings = null) {
  const currentSettings = settings || window.__ytrAiSettings || DEFAULT_SETTINGS;
  const prompt = getCurrentPromptText();
  const saveButton = document.querySelector('[data-role="save-prompt-preset"]');
  const renameButton = document.querySelector('[data-role="rename-prompt-preset"]');
  const deleteButton = document.querySelector('[data-role="delete-prompt-preset"]');
  const matched = getSavedPromptMatch(currentSettings, prompt);
  if (matched) activeSavedPromptName = matched.name;
  const selectedBuiltInPrompt = getSelectedPresetDefaultPrompt();
  const changedFromBuiltIn = prompt && prompt !== selectedBuiltInPrompt;
  if (saveButton instanceof HTMLElement) saveButton.hidden = !changedFromBuiltIn;
  if (renameButton instanceof HTMLElement) renameButton.hidden = !matched;
  if (deleteButton instanceof HTMLElement) deleteButton.hidden = !matched;
  document.querySelectorAll('[data-role="prompt-presets"] [data-saved-prompt]').forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.setAttribute('aria-pressed', String(button.dataset.savedPrompt === activeSavedPromptName));
    }
  });
}

function syncPromptField(settings, forcePreset = false) {
  const promptField = document.querySelector('[data-setting="aiVideoChatCustomSystemPrompt"]');
  if (!(promptField instanceof HTMLTextAreaElement)) return;
  const preset = settings.aiVideoChatSystemPreset || DEFAULT_SETTINGS.aiVideoChatSystemPreset;
  const existingPrompt = String(settings.aiVideoChatCustomSystemPrompt || '');
  if (forcePreset || !existingPrompt.trim()) {
    promptField.value = buildSystemPromptForPreset(preset);
    activeSavedPromptName = '';
  } else {
    promptField.value = existingPrompt;
    const matched = getSavedPromptMatch(settings, existingPrompt);
    activeSavedPromptName = matched?.name || '';
  }
  syncAutoTextarea(promptField);
  syncPromptActions(settings);
}

function syncAiSettingsForm(settings = {}, options = {}) {
  isSyncingForm = true;
  const merged = { ...DEFAULT_SETTINGS, ...(window.__ytrAiSettings || {}), ...settings };
  updateLocale(merged.language);
  applyTranslations();
  renderLanguageMenu();
  const provider = ['openrouter', 'openai', 'anthropic', 'perplexity'].includes(merged.aiVideoChatProvider)
    ? merged.aiVideoChatProvider
    : DEFAULT_SETTINGS.aiVideoChatProvider;
  fillModelChoices(provider, merged.aiVideoChatModel);
  setChoiceValue('aiVideoChatProvider', provider);
  setChoiceValue('aiVideoChatSystemPreset', merged.aiVideoChatSystemPreset);
  populateResponseLanguageSelect(merged.aiVideoChatResponseLanguage || DEFAULT_SETTINGS.aiVideoChatResponseLanguage);
  setChoiceValue('aiVideoChatAdultMode', merged.aiVideoChatAdultMode || DEFAULT_SETTINGS.aiVideoChatAdultMode);
  setChoiceValue('aiVideoChatReasoningDepth', merged.aiVideoChatReasoningDepth || DEFAULT_SETTINGS.aiVideoChatReasoningDepth);

  document.querySelectorAll('[data-setting]').forEach((field) => {
    const key = field.dataset.setting;
    if (!key) return;
    if (key === 'aiVideoChatCustomSystemPrompt') return;
    if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      field.checked = Boolean(merged[key]);
      field.closest('.toggle-track')?.classList.toggle('active', field.checked);
    } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      field.value = String(merged[key] ?? DEFAULT_SETTINGS[key] ?? '');
      syncAutoTextarea(field);
    }
  });

  const temperature = clampTemperature(merged.aiVideoChatTemperature);
  syncSliderControl('aiVideoChatTemperature', temperature);
  syncSliderControl('aiVideoChatMaxWebSnippets', merged.aiVideoChatMaxWebSnippets);
  syncSliderControl('aiVideoChatMaxYouTubeLinks', merged.aiVideoChatMaxYouTubeLinks);
  syncSliderControl('aiVideoChatMaxTokens', merged.aiVideoChatMaxTokens);

  const customModelField = document.querySelector('[data-role="custom-model-field"]');
  if (customModelField instanceof HTMLElement) {
    customModelField.hidden = getChoiceValue('aiVideoChatModel', merged.aiVideoChatModel) !== 'custom';
  }
  updateCustomModelIcon();
  syncPromptField(merged, Boolean(options.forcePresetPrompt));
  renderPromptPresets(merged);
  window.__ytrAiSettings = merged;
  updateProviderGuideLink(provider);
  isSyncingForm = false;
}

function collectAiSettingsFormPatch() {
  const patch = {};
  document.querySelectorAll('[data-setting]').forEach((field) => {
    const key = field.dataset.setting;
    if (!key) return;
    if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      patch[key] = field.checked;
    } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      if (key === 'aiVideoChatTemperature') {
        patch[key] = clampTemperature(field.value);
      } else if (key === 'aiVideoChatMaxWebSnippets') {
        patch[key] = clampInteger(field.value, DEFAULT_SETTINGS.aiVideoChatMaxWebSnippets, 2, 12);
      } else if (key === 'aiVideoChatMaxYouTubeLinks') {
        patch[key] = clampInteger(field.value, DEFAULT_SETTINGS.aiVideoChatMaxYouTubeLinks, 2, 12);
      } else if (key === 'aiVideoChatMaxTokens') {
        patch[key] = clampInteger(field.value, DEFAULT_SETTINGS.aiVideoChatMaxTokens, 300, 1600);
      } else {
        patch[key] = field.value;
      }
    }
  });
  patch.aiVideoChatProvider = getChoiceValue('aiVideoChatProvider', DEFAULT_SETTINGS.aiVideoChatProvider);
  patch.aiVideoChatModel = getChoiceValue('aiVideoChatModel', DEFAULT_SETTINGS.aiVideoChatModel);
  patch.aiVideoChatSystemPreset = getChoiceValue('aiVideoChatSystemPreset', activeSavedPromptName ? 'custom' : DEFAULT_SETTINGS.aiVideoChatSystemPreset) || 'custom';
  patch.aiVideoChatAdultMode = getChoiceValue('aiVideoChatAdultMode', DEFAULT_SETTINGS.aiVideoChatAdultMode);
  patch.aiVideoChatReasoningDepth = getChoiceValue('aiVideoChatReasoningDepth', DEFAULT_SETTINGS.aiVideoChatReasoningDepth);
  return patch;
}

function showSettingsStatus(message, tone = 'ok') {
  const status = document.querySelector('[data-role="settings-status"]');
  if (!(status instanceof HTMLElement)) return;
  if (status._ytrTimer) window.clearTimeout(status._ytrTimer);
  status.textContent = message;
  status.dataset.state = 'visible';
  status.dataset.tone = tone;
  status._ytrTimer = window.setTimeout(() => {
    status.dataset.state = '';
    status.textContent = '';
  }, 1400);
}

async function autoSaveSettings(extraPatch = null) {
  if (isSyncingForm) return;
  try {
    const current = await loadStoredSettings();
    const patch = extraPatch || collectAiSettingsFormPatch();
    const next = await saveStoredSettings({
      ...patch,
      aiVideoChatSavedPrompts: Array.isArray(current.aiVideoChatSavedPrompts) ? current.aiVideoChatSavedPrompts : [],
    });
    window.__ytrAiSettings = { ...DEFAULT_SETTINGS, ...next };
    showSettingsStatus(t('saved'));
  } catch {
    showSettingsStatus(t('saveError'), 'error');
  }
}

function scheduleAutoSave(delay = 250) {
  if (isSyncingForm) return;
  if (autoSaveTimer) window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(() => void autoSaveSettings(), delay);
}

function getProviderGuide(provider) {
  const guideJumps = PROVIDERS
    .map(([id, label, iconClass]) => `<button class="provider-guide-jump" type="button" data-provider-guide-jump="${id}"><span class="provider-icon ${iconClass}" aria-hidden="true"></span><span>${label}</span></button>`)
    .join('');
  const otherGuides = `<div class="provider-guide-jumps">${guideJumps}</div>`;
  const guides = {
    openrouter: {
      title: isRuLocale ? 'Ключ OpenRouter' : 'OpenRouter key',
      html: isRuLocale
        ? `<p><b>1.</b> Открой <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener">openrouter.ai/settings/keys</a> и войди в аккаунт.</p><p><b>2.</b> Нажми <b>Create key</b>, задай любое название и создай ключ. Скопируй значение целиком: оно обычно начинается с <code>sk-or-v1-</code>.</p><p><b>3.</b> Вставь ключ в поле API-ключ. В блоке модели выбери бесплатный пресет или открой страницу нужной модели на OpenRouter и вставь её точный model id в Custom.</p><p><b>4.</b> Если чат пишет User not found или модель недоступна, создай свежий ключ в том же аккаунте и попробуй другой бесплатный пресет.</p>${otherGuides}`
        : `<p><b>1.</b> Open <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener">openrouter.ai/settings/keys</a> and sign in.</p><p><b>2.</b> Click <b>Create key</b>, name it, create it, and copy the full value. It usually starts with <code>sk-or-v1-</code>.</p><p><b>3.</b> Paste it into API key. Pick a free preset or open a model page on OpenRouter and paste its exact model id into Custom.</p><p><b>4.</b> If the chat says User not found or a model is unavailable, create a fresh key on the same account and try another free preset.</p>${otherGuides}`,
    },
    openai: {
      title: isRuLocale ? 'Ключ ChatGPT / OpenAI' : 'ChatGPT / OpenAI key',
      html: isRuLocale
        ? `<p><b>1.</b> Открой <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a> в аккаунте OpenAI Platform.</p><p><b>2.</b> Нажми <b>Create new secret key</b>, скопируй ключ один раз и вставь его в поле API-ключ.</p><p><b>3.</b> Выбери модель OpenAI из пресетов или Custom и укажи точное имя модели. Убедись, что в аккаунте включён биллинг/лимиты, иначе запросы могут падать.</p>${otherGuides}`
        : `<p><b>1.</b> Open <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a> in your OpenAI Platform account.</p><p><b>2.</b> Click <b>Create new secret key</b>, copy the key once, and paste it into API key.</p><p><b>3.</b> Pick an OpenAI preset or Custom and enter the exact model name. Make sure billing/limits are enabled on the account.</p>${otherGuides}`,
    },
    anthropic: {
      title: isRuLocale ? 'Ключ Claude / Anthropic' : 'Claude / Anthropic key',
      html: isRuLocale
        ? `<p><b>1.</b> Открой <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com/settings/keys</a> в Anthropic Console.</p><p><b>2.</b> Создай ключ, скопируй его полностью и вставь в поле API-ключ.</p><p><b>3.</b> Выбери Claude-модель из списка или Custom. Если запросы не идут, проверь кредиты, регион и доступность выбранной модели.</p>${otherGuides}`
        : `<p><b>1.</b> Open <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com/settings/keys</a> in Anthropic Console.</p><p><b>2.</b> Create a key, copy the full value, and paste it into API key.</p><p><b>3.</b> Pick a Claude model or Custom. If requests fail, check credits, region, and model availability.</p>${otherGuides}`,
    },
    perplexity: {
      title: isRuLocale ? 'Ключ Perplexity' : 'Perplexity key',
      html: isRuLocale
        ? `<p><b>1.</b> Открой <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noopener">perplexity.ai/settings/api</a>.</p><p><b>2.</b> Создай API-ключ, скопируй его и вставь в поле API-ключ.</p><p><b>3.</b> Выбери Sonar-модель. Perplexity особенно полезен для ответов, где нужно много свежего веб-контекста.</p>${otherGuides}`
        : `<p><b>1.</b> Open <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noopener">perplexity.ai/settings/api</a>.</p><p><b>2.</b> Create an API key, copy it, and paste it into API key.</p><p><b>3.</b> Pick a Sonar model. Perplexity is especially useful for search-heavy answers.</p>${otherGuides}`,
    },
  };
  return guides[provider] || guides.openrouter;
}

function updateProviderGuideLink(provider) {
  const link = document.querySelector('[data-role="provider-guide-link"]');
  if (!(link instanceof HTMLButtonElement)) return;
  const labels = {
    openrouter: isRuLocale ? 'Как получить ключ OpenRouter' : 'How to get an OpenRouter key',
    openai: isRuLocale ? 'Как получить ключ OpenAI' : 'How to get an OpenAI key',
    anthropic: isRuLocale ? 'Как получить ключ Claude' : 'How to get a Claude key',
    perplexity: isRuLocale ? 'Как получить ключ Perplexity' : 'How to get a Perplexity key',
  };
  link.textContent = labels[provider] || labels.openrouter;
}

function openProviderGuide(provider) {
  const modal = document.querySelector('[data-role="provider-guide-modal"]');
  const title = document.querySelector('[data-role="provider-guide-modal"] .modal-title');
  const body = document.querySelector('[data-role="provider-guide-body"]');
  if (!(modal instanceof HTMLElement) || !(title instanceof HTMLElement) || !(body instanceof HTMLElement)) return;
  const guide = getProviderGuide(provider);
  const providerMeta = PROVIDERS.find(([id]) => id === provider) || PROVIDERS[0];
  title.innerHTML = `<span class="provider-icon ${providerMeta[2]}" aria-hidden="true"></span><span></span>`;
  const titleText = title.querySelector('span:last-child');
  if (titleText instanceof HTMLElement) titleText.textContent = guide.title;
  body.innerHTML = guide.html;
  body.querySelectorAll('[data-provider-guide-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextProvider = button.getAttribute('data-provider-guide-jump') || 'openrouter';
      openProviderGuide(nextProvider);
    });
  });
  modal.hidden = false;
}

function closeProviderGuide() {
  const modal = document.querySelector('[data-role="provider-guide-modal"]');
  if (modal instanceof HTMLElement) modal.hidden = true;
}

async function checkExtensionVersion(force = false) {
  const button = document.querySelector('[data-role="version-button"]');
  const menu = document.querySelector('[data-role="update-menu"]');
  if (!(button instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) return;
  const currentVersion = runtimeApi?.getManifest ? runtimeApi.getManifest().version : '0.6.0';
  button.textContent = `v${currentVersion}`;
  if (!force) return;
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  menu.innerHTML = `<div class="update-status">${t('updateChecking')}</div>`;
  try {
    const response = await fetch('https://api.github.com/repos/crixqq/YouTube-Rewind/releases/latest', { cache: 'no-store' });
    const data = await response.json();
    const latest = String(data?.tag_name || '').replace(/^v/, '');
    const url = String(data?.html_url || 'https://github.com/crixqq/YouTube-Rewind/releases');
    const newer = latest && compareVersions(latest, currentVersion) > 0;
    if (newer && !button.querySelector('.update-dot')) {
      const dot = document.createElement('span');
      dot.className = 'update-dot';
      button.appendChild(dot);
    }
    menu.innerHTML = newer
      ? `<div class="update-status update-status-available">${t('updateAvailable', { version: latest })}</div><a class="update-download" href="${url}" target="_blank" rel="noopener">${t('updateOpen')}</a>`
      : `<div class="update-status update-status-ok">${t('updateCurrent')}</div>`;
  } catch {
    menu.innerHTML = `<div class="update-status update-status-error">${t('updateError')}</div><div class="update-note">${t('updateErrorNote')}</div>`;
  }
}

function compareVersions(remote, local) {
  const parse = (value) => String(value || '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => Number.isFinite(part) ? part : 0);
  const a = parse(remote);
  const b = parse(local);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function bindAiSettingsForm() {
  document.querySelectorAll('[data-choice-group="aiVideoChatProvider"] [data-value]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const provider = event.currentTarget.dataset.value || DEFAULT_SETTINGS.aiVideoChatProvider;
      setChoiceValue('aiVideoChatProvider', provider);
      fillModelChoices(provider, '');
      syncAiSettingsForm({ ...(window.__ytrAiSettings || {}), ...collectAiSettingsFormPatch(), aiVideoChatProvider: provider });
      scheduleAutoSave();
    });
  });
  document.querySelectorAll('[data-choice-group="aiVideoChatSystemPreset"] [data-value]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const preset = event.currentTarget.dataset.value || DEFAULT_SETTINGS.aiVideoChatSystemPreset;
      activeSavedPromptName = '';
      setChoiceValue('aiVideoChatSystemPreset', preset);
      syncAiSettingsForm({ ...(window.__ytrAiSettings || {}), ...collectAiSettingsFormPatch(), aiVideoChatSystemPreset: preset }, { forcePresetPrompt: true });
      scheduleAutoSave();
    });
  });
  document.querySelectorAll('[data-choice-group="aiVideoChatAdultMode"] [data-value], [data-choice-group="aiVideoChatReasoningDepth"] [data-value]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = event.currentTarget;
      const group = target.closest('[data-choice-group]');
      const setting = group instanceof HTMLElement ? group.dataset.choiceGroup : '';
      if (!setting) return;
      setChoiceValue(setting, target.dataset.value || '');
      scheduleAutoSave();
    });
  });
  document.querySelector('[data-setting="aiVideoChatCustomSystemPrompt"]')?.addEventListener('input', (event) => {
    syncAutoTextarea(event.currentTarget);
    syncPromptActions();
    scheduleAutoSave(500);
  });
  document.querySelectorAll('[data-setting]').forEach((field) => {
    if (field.getAttribute('data-setting') === 'aiVideoChatCustomSystemPrompt') return;
    const eventName = (field instanceof HTMLInputElement && field.type === 'checkbox') || field instanceof HTMLSelectElement ? 'change' : 'input';
    field.addEventListener(eventName, () => {
      if (field instanceof HTMLInputElement && field.type === 'checkbox') {
        field.closest('.toggle-track')?.classList.toggle('active', field.checked);
      }
      if (field instanceof HTMLInputElement && field.dataset.sliderInput) {
        const key = field.dataset.sliderInput;
        const value = clampSliderValue(key, field.value);
        syncSliderControl(key, value);
      }
      if (field instanceof HTMLInputElement && field.dataset.setting === 'aiVideoChatCustomModel') {
        updateCustomModelIcon();
      }
      scheduleAutoSave();
    });
  });
  document.querySelectorAll('[data-slider-range]').forEach((range) => {
    const key = range instanceof HTMLInputElement ? range.dataset.sliderRange : '';
    if (key && !sliderAnimationState.has(key)) {
      sliderAnimationState.set(key, { phase: 0, hover: false, press: false });
    }
    const setInteraction = (patch) => {
      if (!key) return;
      sliderAnimationState.set(key, { ...(sliderAnimationState.get(key) || { phase: 0, hover: false, press: false }), ...patch });
      syncSliderControl(key, getSliderCurrentValue(key));
    };
    range.addEventListener('pointerenter', () => setInteraction({ hover: true }));
    range.addEventListener('pointerleave', () => setInteraction({ hover: false, press: false }));
    range.addEventListener('pointerdown', () => setInteraction({ press: true }));
    range.addEventListener('pointerup', () => setInteraction({ press: false }));
    range.addEventListener('pointercancel', () => setInteraction({ press: false }));
    range.addEventListener('input', (event) => {
      if (!(event.currentTarget instanceof HTMLInputElement)) return;
      const key = event.currentTarget.dataset.sliderRange;
      if (!key) return;
      syncSliderControl(key, event.currentTarget.value);
      scheduleAutoSave();
    });
    range.addEventListener('change', (event) => {
      if (!(event.currentTarget instanceof HTMLInputElement)) return;
      const key = event.currentTarget.dataset.sliderRange;
      if (!key) return;
      const input = document.querySelector(`[data-slider-input="${key}"]`);
      if (input instanceof HTMLInputElement) input.value = formatSliderValue(key, event.currentTarget.value);
    });
  });
  startSliderAnimationLoop();
  document.querySelector('[data-role="provider-guide-link"]')?.addEventListener('click', () => {
    openProviderGuide(getChoiceValue('aiVideoChatProvider', DEFAULT_SETTINGS.aiVideoChatProvider));
  });
  document.querySelector('[data-role="provider-guide-close"]')?.addEventListener('click', closeProviderGuide);
  document.querySelector('[data-role="provider-guide-modal"]')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeProviderGuide();
  });
  document.querySelector('[data-role="version-button"]')?.addEventListener('click', () => void checkExtensionVersion(true));
  document.querySelector('[data-role="about-button"]')?.addEventListener('click', () => {
    document.querySelector('#ytr-about')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.querySelector('[data-role="lang-button"]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    const menu = document.querySelector('[data-role="lang-menu"]');
    const button = document.querySelector('[data-role="lang-button"]');
    if (menu instanceof HTMLElement) {
      menu.hidden = !menu.hidden;
      if (button instanceof HTMLButtonElement) button.setAttribute('aria-expanded', String(!menu.hidden));
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.version-wrapper')) return;
    const menu = document.querySelector('[data-role="update-menu"]');
    if (menu instanceof HTMLElement) menu.hidden = true;
    const versionButton = document.querySelector('[data-role="version-button"]');
    if (versionButton instanceof HTMLButtonElement) versionButton.setAttribute('aria-expanded', 'false');
    if (event.target instanceof Element && event.target.closest('.lang-wrapper')) return;
    const langMenu = document.querySelector('[data-role="lang-menu"]');
    const langButton = document.querySelector('[data-role="lang-button"]');
    if (langMenu instanceof HTMLElement) langMenu.hidden = true;
    if (langButton instanceof HTMLButtonElement) langButton.setAttribute('aria-expanded', 'false');
  });
  document.querySelector('[data-role="reset-system-prompt"]')?.addEventListener('click', () => {
    const preset = getChoiceValue('aiVideoChatSystemPreset', DEFAULT_SETTINGS.aiVideoChatSystemPreset);
    activeSavedPromptName = '';
    syncAiSettingsForm({ ...(window.__ytrAiSettings || {}), ...collectAiSettingsFormPatch(), aiVideoChatSystemPreset: preset, aiVideoChatCustomSystemPrompt: buildSystemPromptForPreset(preset) }, { forcePresetPrompt: true });
    scheduleAutoSave();
  });
  document.querySelector('[data-role="save-prompt-preset"]')?.addEventListener('click', async () => {
    const current = await loadStoredSettings();
    const nameField = document.querySelector('[data-role="prompt-preset-name"]');
    const promptField = document.querySelector('[data-setting="aiVideoChatCustomSystemPrompt"]');
    const name = nameField instanceof HTMLInputElement ? nameField.value.trim() : '';
    const prompt = promptField instanceof HTMLTextAreaElement ? promptField.value.trim() : '';
    if (!name || !prompt) {
      showSettingsStatus(t('promptRequired'), 'error');
      return;
    }
    const existing = Array.isArray(current.aiVideoChatSavedPrompts) ? current.aiVideoChatSavedPrompts : [];
    const nextPrompts = [{ name, prompt }, ...existing.filter((entry) => entry?.name !== name)].slice(0, 12);
    activeSavedPromptName = name;
    await saveStoredSettings({ ...collectAiSettingsFormPatch(), aiVideoChatSavedPrompts: nextPrompts });
    if (nameField instanceof HTMLInputElement) nameField.value = '';
    syncAiSettingsForm({ ...current, ...collectAiSettingsFormPatch(), aiVideoChatSavedPrompts: nextPrompts });
    showSettingsStatus(t('promptSaved'));
  });
  document.querySelector('[data-role="rename-prompt-preset"]')?.addEventListener('click', async () => {
    const current = await loadStoredSettings();
    const presets = Array.isArray(current.aiVideoChatSavedPrompts) ? current.aiVideoChatSavedPrompts : [];
    const prompt = getCurrentPromptText();
    const matched = getSavedPromptMatch(current, prompt);
    if (!matched) return;
    const name = window.prompt(t('newStyleName'), matched.name)?.trim();
    if (!name) return;
    const nextPrompts = presets.map((entry) => entry?.name === matched.name ? { name, prompt: matched.prompt } : entry);
    activeSavedPromptName = name;
    await saveStoredSettings({ ...collectAiSettingsFormPatch(), aiVideoChatSavedPrompts: nextPrompts });
    syncAiSettingsForm({ ...current, ...collectAiSettingsFormPatch(), aiVideoChatSavedPrompts: nextPrompts });
    showSettingsStatus(t('promptRenamed'));
  });
  document.querySelector('[data-role="delete-prompt-preset"]')?.addEventListener('click', async () => {
    const current = await loadStoredSettings();
    const prompt = getCurrentPromptText();
    const matched = getSavedPromptMatch(current, prompt);
    if (!matched) return;
    const nextPrompts = (Array.isArray(current.aiVideoChatSavedPrompts) ? current.aiVideoChatSavedPrompts : [])
      .filter((entry) => entry?.name !== matched.name);
    activeSavedPromptName = '';
    await saveStoredSettings({ ...collectAiSettingsFormPatch(), aiVideoChatSavedPrompts: nextPrompts });
    syncAiSettingsForm({ ...current, ...collectAiSettingsFormPatch(), aiVideoChatSavedPrompts: nextPrompts });
    showSettingsStatus(t('promptDeleted'));
  });
}

async function boot() {
  syncBrandLogo();
  void checkExtensionVersion(false);
  let currentSettings = await loadStoredSettings();
  applyInterfaceTheme(currentSettings);
  syncAiSettingsForm(currentSettings);
  bindAiSettingsForm();

  subscribeToSettingsChanges((nextSettings) => {
    currentSettings = nextSettings;
    applyInterfaceTheme(currentSettings);
    syncAiSettingsForm(currentSettings);
  });

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleMediaChange = () => {
    if ((currentSettings.interfaceThemeMode || DEFAULT_SETTINGS.interfaceThemeMode) === 'auto') {
      applyInterfaceTheme(currentSettings);
    }
  };

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handleMediaChange);
  } else if (typeof media.addListener === 'function') {
    media.addListener(handleMediaChange);
  }
}

void boot();
