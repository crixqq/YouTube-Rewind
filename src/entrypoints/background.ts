import { DEFAULT_SETTINGS } from '@/lib/settings';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type CaptureTabMessage = { type?: string };
type OpenRouterMessage = {
  type?: string;
  apiKey?: string;
  provider?: string;
  endpoint?: string;
  model?: string;
  messages?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};
type FetchTextMessage = {
  type?: string;
  url?: string;
};
type DownloadUrlMessage = {
  type?: string;
  url?: string;
  filename?: string;
};
type FetchImageDataUrlMessage = {
  type?: string;
  url?: string;
};
type AiEnrichmentMessage = {
  type?: string;
  title?: string;
  channel?: string;
  description?: string;
  links?: Array<{ text?: string; url?: string; kind?: string }>;
  prompt?: string;
  locale?: 'ru' | 'en';
  maxSnippets?: number;
};
type ModelMetaMessage = {
  type?: string;
  model?: string;
};
type ExtensionLogMessage = {
  type?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  area?: string;
  message?: string;
  data?: unknown;
};
type RuntimeSender = { tab?: { windowId?: number } };

type OpenRouterModelCard = {
  id?: string;
  canonical_slug?: string;
  name?: string;
  description?: string;
  icon_url?: string;
  logo_url?: string;
  provider?: { name?: string; slug?: string } | string;
};

type AiWebSnippet = {
  source: string;
  title: string;
  snippet: string;
  url?: string;
};

type OpenRouterStreamStartMessage = {
  type?: 'start';
  apiKey?: string;
  model?: string;
  messages?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

const STORAGE_KEY = 'ytr_settings';
const EXTENSION_LOGS_KEY = 'ytr_extension_logs';
const MAX_EXTENSION_LOGS = 600;
const LEGACY_VIDEO_INSIGHTS_KEY = ['ytr', 'video', 'insights'].join('_');
const OPENROUTER_CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_HEADERS = {
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://github.com/crixqq/YouTube-Rewind',
  'X-Title': 'YouTube Rewind',
} as const;

const modelCatalogCache: {
  expiresAt: number;
  promise: Promise<OpenRouterModelCard[]> | null;
} = {
  expiresAt: 0,
  promise: null,
};

function isAllowedInternalFetchUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (!/^https?:$/i.test(url.protocol)) return false;
    if (!/^(?:www|m)\.youtube\.com$/i.test(url.hostname)) return false;
    return url.pathname === '/watch'
      || url.pathname === '/api/timedtext'
      || url.pathname === '/results'
      || url.pathname.startsWith('/@')
      || url.pathname.startsWith('/channel/')
      || url.pathname.startsWith('/c/')
      || url.pathname.startsWith('/user/');
  } catch {
    return false;
  }
}

function sanitizeLogData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') return data.slice(0, 1200);
  if (typeof data === 'number' || typeof data === 'boolean') return data;
  try {
    const serialized = JSON.stringify(data);
    return serialized.length > 4000 ? `${serialized.slice(0, 4000)}…` : JSON.parse(serialized);
  } catch {
    return String(data).slice(0, 1200);
  }
}

async function isExtensionLoggingEnabled(): Promise<boolean> {
  const stored = await browser.storage.local.get(STORAGE_KEY).catch(() => ({}));
  const settings = (stored?.[STORAGE_KEY] || {}) as Partial<typeof DEFAULT_SETTINGS>;
  return !!settings.developerEnabled && !!settings.extensionLogEnabled;
}

async function appendExtensionLog(message: ExtensionLogMessage, sender: RuntimeSender): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!await isExtensionLoggingEnabled()) {
    return { ok: true, skipped: true };
  }

  const entry = {
    time: new Date().toISOString(),
    level: message.level || 'info',
    area: String(message.area || 'extension').slice(0, 80),
    message: String(message.message || '').slice(0, 500),
    tabWindowId: sender.tab?.windowId,
    data: sanitizeLogData(message.data),
  };

  const stored = await browser.storage.local.get(EXTENSION_LOGS_KEY).catch(() => ({}));
  const existing = Array.isArray(stored?.[EXTENSION_LOGS_KEY]) ? stored[EXTENSION_LOGS_KEY] : [];
  const nextLogs = [...existing, entry].slice(-MAX_EXTENSION_LOGS);
  await browser.storage.local.set({ [EXTENSION_LOGS_KEY]: nextLogs });
  return { ok: true };
}

function sanitizeChatMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((entry): entry is ChatMessage => {
      return !!entry
        && typeof entry === 'object'
        && typeof (entry as ChatMessage).role === 'string'
        && typeof (entry as ChatMessage).content === 'string';
    })
    .map((entry) => ({
      role: entry.role,
      content: entry.content.trim(),
    }))
    .filter((entry) => !!entry.content);
}

function normalizeCompletionText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractMessageText(
  content: unknown,
  options: {
    trim?: boolean;
    joiner?: string;
  } = {},
): string {
  const {
    trim = true,
    joiner = '',
  } = options;

  let text = '';

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.type === 'string' && part.type === 'text' && typeof part?.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join(joiner);
  }

  return trim ? text.trim() : text;
}

function normalizeTemperature(value: unknown, fallback = 0.2): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(2, Math.max(0, Math.round(numeric * 100) / 100));
}

function normalizeMaxTokens(value: unknown, fallback = 700): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1600, Math.max(300, Math.round(numeric)));
}

function buildOpenRouterRequestBody(model: string, messages: ChatMessage[], stream = false, temperature = 0.2, maxTokens = 700) {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream,
    temperature: normalizeTemperature(temperature),
    max_tokens: normalizeMaxTokens(maxTokens),
  };

  if (model === 'openrouter/free') {
    body.provider = {
      allow_fallbacks: true,
      sort: 'throughput',
    };
  }

  return body;
}

function sanitizeOpenRouterApiKey(value: string | undefined): string {
  return (value || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '');
}

async function requestOpenRouterCompletion(apiKey: string, model: string, messages: ChatMessage[], temperature = 0.2, maxTokens = 700) {
  const response = await fetch(OPENROUTER_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      ...OPENROUTER_HEADERS,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildOpenRouterRequestBody(model, messages, false, temperature, maxTokens)),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      error: data?.error?.message
        || data?.message
        || `OpenRouter request failed (${response.status}).`,
    };
  }

  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const text = normalizeCompletionText(extractMessageText(choice?.message?.content, {
    trim: true,
    joiner: ' ',
  }));

  if (!text) {
    return {
      error: data?.error?.message || 'OpenRouter returned an empty response.',
    };
  }

  return {
    text,
    model: typeof data?.model === 'string' ? data.model : model,
  };
}

function normalizeAiProvider(value: unknown): 'openrouter' | 'openai' | 'anthropic' | 'perplexity' {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'openai' || normalized === 'anthropic' || normalized === 'perplexity') return normalized;
  return 'openrouter';
}

function getAiProviderEndpoint(provider: string, customEndpoint = ''): string {
  if (provider === 'openai') return 'https://api.openai.com/v1/chat/completions';
  if (provider === 'perplexity') return 'https://api.perplexity.ai/chat/completions';
  if (provider === 'anthropic') return 'https://api.anthropic.com/v1/messages';
  return OPENROUTER_CHAT_ENDPOINT;
}

function convertMessagesForAnthropic(messages: ChatMessage[]): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  const converted = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: message.content,
    }));
  return { system, messages: converted };
}

async function requestAiCompletion(options: {
  provider: string;
  endpoint?: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}) {
  const provider = normalizeAiProvider(options.provider);
  const endpoint = getAiProviderEndpoint(provider, options.endpoint || '');

  if (provider === 'openrouter') {
    return requestOpenRouterCompletion(options.apiKey, options.model, options.messages, options.temperature, options.maxTokens);
  }

  const temperature = normalizeTemperature(options.temperature);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  let body: Record<string, unknown>;

  if (provider === 'anthropic') {
    const converted = convertMessagesForAnthropic(options.messages);
    headers['x-api-key'] = options.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: options.model,
      max_tokens: normalizeMaxTokens(options.maxTokens, 900),
      temperature,
      system: converted.system || undefined,
      messages: converted.messages,
    };
  } else {
    headers.Authorization = `Bearer ${options.apiKey}`;
    body = buildOpenRouterRequestBody(options.model, options.messages, false, temperature, options.maxTokens);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      error: data?.error?.message
        || data?.message
        || `${provider} request failed (${response.status}).`,
    };
  }

  const text = provider === 'anthropic'
    ? normalizeCompletionText(
      Array.isArray(data?.content)
        ? data.content.map((part: { text?: string }) => part?.text || '').join('\n')
        : '',
    )
    : normalizeCompletionText(extractMessageText(data?.choices?.[0]?.message?.content, { trim: true, joiner: ' ' }));

  return text
    ? { text, model: typeof data?.model === 'string' ? data.model : options.model }
    : { error: `${provider} returned an empty response.` };
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractQuotedSearchTerms(value: string): string[] {
  return Array.from(value.matchAll(/["'«“]([^"'»”]{2,80})["'»”]/g))
    .map((match) => match[1]?.trim() || '')
    .filter(Boolean);
}

function buildEnrichmentQueries(
  title: string,
  channel: string,
  prompt: string,
  description = '',
  links: Array<{ text?: string; url?: string; kind?: string }> = [],
): string[] {
  const normalizedTitle = title.replace(/["'`]+/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedChannel = channel.replace(/["'`]+/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedPrompt = prompt.replace(/["'`]+/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedDescription = description.replace(/["'`]+/g, ' ').replace(/\s+/g, ' ').trim();
  const quotedTerms = extractQuotedSearchTerms(`${title}\n${prompt}\n${description}`).slice(0, 4);
  const sourceLinkQueries = links
    .filter((link) => /youtube-video|external|music/i.test(link.kind || '') || /оригинал|original|source|источник|cover|кавер/i.test(`${link.text || ''} ${link.url || ''}`))
    .map((link) => `${link.text || ''} ${link.url || ''}`.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);
  const socialIntent = /соц|ссылк|контакт|тг|телеграм|telegram|twitch|boosty|vk|instagram|tiktok|social|contact|links/i.test(normalizedPrompt);
  const reactionIntent = /реакц|reaction|reacts|смотрит|original|оригинал|source|источник/i.test(`${normalizedTitle} ${normalizedDescription} ${normalizedPrompt}`);
  const genericPromptWords = new Set([
    'дай', 'скинь', 'ссылки', 'соцсети', 'соц', 'сет', 'автора', 'автор', 'кто', 'что', 'как', 'где',
    'почему', 'ролик', 'видос', 'видео', 'про', 'это', 'мне', 'его', 'ее', 'её', 'их', 'the', 'what',
    'who', 'where', 'why', 'how', 'video', 'author', 'socials', 'links', 'contacts', 'send', 'give',
  ]);
  const entityTerms = extractQuotedSearchTerms(`${prompt}\n${title}`)
    .concat((normalizedPrompt.match(/[@\p{L}\p{N}_-]{4,}/gu) || []).slice(0, 4))
    .map((term) => term.replace(/^[@#]+/, '').trim())
    .filter((term) => term && !genericPromptWords.has(term.toLowerCase()))
    .slice(0, 5);
  const socialQueries = socialIntent
    ? entityTerms.flatMap((term) => [
      `${term} соцсети`,
      `${term} telegram twitch youtube`,
      `${term} официальный канал`,
    ]).slice(0, 4)
    : [];
  const originalQueries = reactionIntent
    ? [
      `${normalizedTitle} оригинал видео`,
      `${normalizedTitle} original video`,
      ...sourceLinkQueries.map((query) => `${query} original source`),
    ]
    : [];
  const intentQuery = socialIntent && entityTerms[0]
    ? `${entityTerms[0]} ${normalizedChannel} ${normalizedTitle} соцсети контакты`
    : [normalizedChannel, normalizedTitle].filter(Boolean).join(' ');

  return [
    ...quotedTerms,
    ...socialQueries,
    ...originalQueries,
    intentQuery,
    [normalizedPrompt, normalizedTitle].filter(Boolean).join(' '),
    [normalizedPrompt, normalizedDescription.slice(0, 220)].filter(Boolean).join(' '),
    ...sourceLinkQueries.map((query) => [normalizedPrompt, query].filter(Boolean).join(' ')),
    [normalizedChannel, normalizedTitle].filter(Boolean).join(' '),
    [normalizedChannel, normalizedPrompt].filter(Boolean).join(' '),
    normalizedTitle,
  ]
    .map((query) => query.trim())
    .filter(Boolean)
    .filter((query, index, list) => list.indexOf(query) === index)
    .slice(0, 8);
}

function flattenDuckDuckGoTopics(topics: unknown[]): Array<{ Text?: string; FirstURL?: string }> {
  const flattened: Array<{ Text?: string; FirstURL?: string }> = [];

  for (const topic of topics) {
    if (!topic || typeof topic !== 'object') continue;
    const typedTopic = topic as {
      Text?: string;
      FirstURL?: string;
      Topics?: unknown[];
    };

    if (Array.isArray(typedTopic.Topics)) {
      flattened.push(...flattenDuckDuckGoTopics(typedTopic.Topics));
      continue;
    }

    flattened.push(typedTopic);
  }

  return flattened;
}

async function fetchDuckDuckGoSnippets(query: string, limit: number): Promise<AiWebSnippet[]> {
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');
  url.searchParams.set('no_redirect', '1');

  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) return [];

  const data = await response.json().catch(() => null) as {
    Heading?: string;
    AbstractText?: string;
    AbstractURL?: string;
    Answer?: string;
    AnswerType?: string;
    RelatedTopics?: unknown[];
  } | null;

  if (!data) return [];

  const snippets: AiWebSnippet[] = [];

  const abstractText = stripHtmlTags(data.AbstractText || '');
  if (abstractText) {
    snippets.push({
      source: 'DuckDuckGo',
      title: stripHtmlTags(data.Heading || query),
      snippet: abstractText,
      url: data.AbstractURL || undefined,
    });
  }

  const answerText = stripHtmlTags(data.Answer || '');
  if (answerText && answerText !== abstractText) {
    snippets.push({
      source: 'DuckDuckGo',
      title: data.AnswerType ? `${query} (${data.AnswerType})` : query,
      snippet: answerText,
    });
  }

  const relatedTopics = flattenDuckDuckGoTopics(Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []);
  for (const topic of relatedTopics) {
    const text = stripHtmlTags(topic.Text || '');
    if (!text) continue;
    snippets.push({
      source: 'DuckDuckGo',
      title: query,
      snippet: text,
      url: topic.FirstURL || undefined,
    });
    if (snippets.length >= limit) break;
  }

  return snippets.slice(0, limit);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

async function fetchDuckDuckGoHtmlResults(query: string, limit: number): Promise<AiWebSnippet[]> {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 YouTube-Rewind',
    },
  });
  if (!response.ok) return [];

  const html = await response.text();
  const snippets: AiWebSnippet[] = [];
  const resultPattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = resultPattern.exec(html)) && snippets.length < limit) {
    const rawUrl = decodeHtmlEntities(match[1] || '');
    const title = stripHtmlTags(decodeHtmlEntities(match[2] || ''));
    const snippet = stripHtmlTags(decodeHtmlEntities(match[3] || ''));
    if (!title || !snippet) continue;

    let resultUrl = rawUrl;
    try {
      const parsed = new URL(rawUrl, 'https://duckduckgo.com');
      const redirected = parsed.searchParams.get('uddg');
      resultUrl = redirected ? decodeURIComponent(redirected) : parsed.toString();
    } catch {}

    snippets.push({
      source: 'DuckDuckGo Search',
      title,
      snippet,
      url: resultUrl,
    });
  }

  return snippets;
}

function getWikipediaDomains(locale: 'ru' | 'en'): string[] {
  return locale === 'ru'
    ? ['ru.wikipedia.org', 'en.wikipedia.org']
    : ['en.wikipedia.org'];
}

async function fetchWikipediaSnippets(query: string, locale: 'ru' | 'en', limit: number): Promise<AiWebSnippet[]> {
  const snippets: AiWebSnippet[] = [];

  for (const domain of getWikipediaDomains(locale)) {
    const url = new URL(`https://${domain}/w/api.php`);
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'search');
    url.searchParams.set('srsearch', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('utf8', '1');
    url.searchParams.set('origin', '*');
    url.searchParams.set('srlimit', String(limit));

    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) continue;

    const data = await response.json().catch(() => null) as {
      query?: {
        search?: Array<{
          title?: string;
          snippet?: string;
          pageid?: number;
        }>;
      };
    } | null;

    const results = Array.isArray(data?.query?.search) ? data.query.search : [];
    for (const result of results) {
      const title = stripHtmlTags(result.title || '');
      const snippet = stripHtmlTags(result.snippet || '');
      if (!title || !snippet) continue;

      snippets.push({
        source: domain.startsWith('ru.') ? 'Wikipedia RU' : 'Wikipedia',
        title,
        snippet,
        url: typeof result.pageid === 'number'
          ? `https://${domain}/?curid=${result.pageid}`
          : undefined,
      });

      if (snippets.length >= limit) break;
    }

    if (snippets.length) break;
  }

  return snippets.slice(0, limit);
}

async function gatherAiWebSnippets(
  title: string,
  channel: string,
  prompt: string,
  locale: 'ru' | 'en',
  description = '',
  links: Array<{ text?: string; url?: string; kind?: string }> = [],
  maxSnippets = 4,
): Promise<{ snippets: AiWebSnippet[]; queries: string[] }> {
  const queries = buildEnrichmentQueries(title, channel, prompt, description, links);
  const snippets: AiWebSnippet[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const querySnippets = [
      ...await fetchDuckDuckGoSnippets(query, maxSnippets),
      ...await fetchDuckDuckGoHtmlResults(query, maxSnippets),
      ...await fetchWikipediaSnippets(query, locale, maxSnippets),
    ];

    for (const snippet of querySnippets) {
      const key = [snippet.source, snippet.title, snippet.url || '', snippet.snippet].join('::');
      if (seen.has(key)) continue;
      seen.add(key);
      snippets.push(snippet);
      if (snippets.length >= maxSnippets) {
        return { snippets, queries };
      }
    }
  }

  return { snippets, queries };
}

async function fetchOpenRouterModels(force = false): Promise<OpenRouterModelCard[]> {
  const now = Date.now();
  if (!force && modelCatalogCache.promise && modelCatalogCache.expiresAt > now) {
    return modelCatalogCache.promise;
  }

  modelCatalogCache.promise = fetch(OPENROUTER_MODELS_ENDPOINT, { cache: 'no-store' })
    .then(async (response) => {
      const data = await response.json().catch(() => null) as { data?: OpenRouterModelCard[] } | null;
      return Array.isArray(data?.data) ? data.data : [];
    })
    .catch(() => [])
    .finally(() => {
      modelCatalogCache.expiresAt = Date.now() + (30 * 60 * 1000);
    });

  return modelCatalogCache.promise;
}

function extractModelProvider(card: OpenRouterModelCard | null, modelId: string): string {
  if (typeof card?.provider === 'string' && card.provider.trim()) {
    return card.provider.trim().toLowerCase();
  }

  if (card?.provider && typeof card.provider === 'object') {
    const provider = card.provider.slug || card.provider.name;
    if (typeof provider === 'string' && provider.trim()) {
      return provider.trim().toLowerCase();
    }
  }

  const providerFromId = modelId.split('/')[0] || modelId;
  return providerFromId.trim().toLowerCase();
}

function findModelCard(models: OpenRouterModelCard[], modelId: string): OpenRouterModelCard | null {
  const normalizedModelId = modelId.trim().toLowerCase();
  if (!normalizedModelId) return null;

  const exactMatch = models.find((entry) => {
    const candidates = [entry.id, entry.canonical_slug, entry.name]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase());
    return candidates.includes(normalizedModelId);
  });
  if (exactMatch) return exactMatch;

  return models.find((entry) => {
    const candidateId = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : '';
    return candidateId.startsWith(normalizedModelId) || normalizedModelId.startsWith(candidateId);
  }) || null;
}

function emitPortMessage(port: browser.runtime.Port, payload: unknown): void {
  try {
    port.postMessage(payload);
  } catch {}
}

function redactForLog(value: string | undefined, visible = 6): string {
  const normalized = (value || '').trim();
  if (!normalized) return '';
  if (normalized.length <= visible * 2) return `${normalized.slice(0, 2)}…`;
  return `${normalized.slice(0, visible)}…${normalized.slice(-4)}`;
}

function parseSseBuffer(buffer: string, onData: (data: string) => void): string {
  let normalized = buffer.replace(/\r\n/g, '\n');
  let boundaryIndex = normalized.indexOf('\n\n');

  while (boundaryIndex >= 0) {
    const rawEvent = normalized.slice(0, boundaryIndex);
    normalized = normalized.slice(boundaryIndex + 2);

    const data = rawEvent
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.startsWith('data: ')
        ? line.slice(6)
        : line.slice(5))
      .join('\n');

    if (data) onData(data);
    boundaryIndex = normalized.indexOf('\n\n');
  }

  return normalized;
}

function extractStreamDeltaText(payload: unknown): string {
  const choice = Array.isArray((payload as { choices?: unknown[] })?.choices)
    ? (payload as { choices?: unknown[] }).choices?.[0] as {
      delta?: { content?: unknown };
      message?: { content?: unknown };
    } | undefined
    : undefined;

  return extractMessageText(choice?.delta?.content ?? choice?.message?.content, {
    trim: false,
    joiner: '',
  });
}

function handleOpenRouterStreamPort(port: browser.runtime.Port): void {
  if (port.name !== 'ytr-openrouter-stream') return;

  let started = false;
  let controller: AbortController | null = null;
  let settled = false;

  const stop = () => {
    controller?.abort();
    controller = null;
  };

  port.onDisconnect.addListener(stop);

  port.onMessage.addListener((rawMessage: unknown) => {
    if (started) return;

    const message = rawMessage as OpenRouterStreamStartMessage;
    if (message?.type !== 'start') return;

    started = true;

    const apiKey = sanitizeOpenRouterApiKey(message.apiKey);
    const model = message.model?.trim();
    const messages = sanitizeChatMessages(message.messages);

    if (!apiKey) {
      emitPortMessage(port, { type: 'error', error: 'Missing OpenRouter API key.' });
      settled = true;
      stop();
      return;
    }

    if (!model) {
      emitPortMessage(port, { type: 'error', error: 'Missing OpenRouter model id.' });
      settled = true;
      stop();
      return;
    }

    if (!messages.length) {
      emitPortMessage(port, { type: 'error', error: 'Missing chat messages.' });
      settled = true;
      stop();
      return;
    }

    void (async () => {
      controller = new AbortController();
      emitPortMessage(port, { type: 'status', status: 'connecting' });
      void appendExtensionLog({
        type: 'ytr_extension_log',
        level: 'info',
        area: 'ai.openrouter.stream',
        message: 'stream request started',
        data: {
          model,
          messageCount: messages.length,
          promptChars: messages.reduce((sum, entry) => sum + entry.content.length, 0),
          key: redactForLog(apiKey),
        },
      }, {});

      try {
        const response = await fetch(OPENROUTER_CHAT_ENDPOINT, {
          method: 'POST',
          headers: {
            ...OPENROUTER_HEADERS,
            Authorization: `Bearer ${apiKey}`,
          },
              body: JSON.stringify(buildOpenRouterRequestBody(model, messages, true, message.temperature, message.maxTokens)),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          void appendExtensionLog({
            type: 'ytr_extension_log',
            level: 'warn',
            area: 'ai.openrouter.stream',
            message: 'stream request failed',
            data: { model, status: response.status, error: data?.error?.message || data?.message },
          }, {});
          emitPortMessage(port, {
            type: 'error',
            error: data?.error?.message
              || data?.message
              || `OpenRouter request failed (${response.status}).`,
          });
          settled = true;
          stop();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          void appendExtensionLog({
            type: 'ytr_extension_log',
            level: 'warn',
            area: 'ai.openrouter.stream',
            message: 'stream body missing',
            data: { model },
          }, {});
          emitPortMessage(port, { type: 'error', error: 'OpenRouter did not return a stream.' });
          settled = true;
          stop();
          return;
        }

        emitPortMessage(port, { type: 'status', status: 'streaming' });

        const decoder = new TextDecoder();
        let buffer = '';
        let streamedModel = model;
        let failed = false;

        while (!failed) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          buffer = parseSseBuffer(buffer, (eventData) => {
            if (eventData === '[DONE]') return;

            let payload: {
              model?: string;
              error?: { message?: string };
              message?: string;
              choices?: unknown[];
            } | null = null;

            try {
              payload = JSON.parse(eventData);
            } catch {
              return;
            }

            if (typeof payload?.model === 'string' && payload.model.trim()) {
              streamedModel = payload.model;
            }

            const errorMessage = payload?.error?.message || payload?.message;
            if (errorMessage) {
              void appendExtensionLog({
                type: 'ytr_extension_log',
                level: 'warn',
                area: 'ai.openrouter.stream',
                message: 'stream payload error',
                data: { model: streamedModel, error: errorMessage },
              }, {});
              emitPortMessage(port, { type: 'error', error: errorMessage });
              failed = true;
              settled = true;
              stop();
              return;
            }

            const deltaText = extractStreamDeltaText(payload);
            if (deltaText) {
              emitPortMessage(port, { type: 'delta', text: deltaText });
            }
          });
        }

        if (!failed) {
          void appendExtensionLog({
            type: 'ytr_extension_log',
            level: 'info',
            area: 'ai.openrouter.stream',
            message: 'stream request completed',
            data: { model: streamedModel },
          }, {});
          emitPortMessage(port, { type: 'done', model: streamedModel });
          settled = true;
          stop();
        }
      } catch (error) {
        if (controller?.signal.aborted && settled) return;
        void appendExtensionLog({
          type: 'ytr_extension_log',
          level: 'error',
          area: 'ai.openrouter.stream',
          message: 'stream request crashed',
          data: { model, error: error instanceof Error ? error.message : String(error) },
        }, {});
        emitPortMessage(port, {
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
        settled = true;
        stop();
      }
    })();
  });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      const existing = await browser.storage.local.get(STORAGE_KEY);
      if (!existing[STORAGE_KEY]) {
        await browser.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
      }
    }
    await browser.storage.local.remove(LEGACY_VIDEO_INSIGHTS_KEY).catch(() => {});
  });

  browser.runtime.onConnect.addListener((port) => {
    handleOpenRouterStreamPort(port);
  });

  browser.runtime.onMessage.addListener((message: unknown, sender: RuntimeSender) => {
    if (!message || typeof message !== 'object') {
      return undefined;
    }

    const extensionLogMessage = message as ExtensionLogMessage;
    if (extensionLogMessage.type === 'ytr_extension_log') {
      return appendExtensionLog(extensionLogMessage, sender)
        .catch((error) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }));
    }

    if (extensionLogMessage.type === 'ytr_extension_logs_get') {
      return browser.storage.local.get(EXTENSION_LOGS_KEY)
        .then((stored) => ({
          logs: Array.isArray(stored?.[EXTENSION_LOGS_KEY]) ? stored[EXTENSION_LOGS_KEY] : [],
        }))
        .catch((error) => ({
          logs: [],
          error: error instanceof Error ? error.message : String(error),
        }));
    }

    if (extensionLogMessage.type === 'ytr_extension_logs_clear') {
      return browser.storage.local.remove(EXTENSION_LOGS_KEY)
        .then(() => ({ ok: true }))
        .catch((error) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }));
    }

    const typedMessage = message as CaptureTabMessage;
    if (typedMessage.type === 'ytr_capture_visible_tab') {
      return browser.tabs.captureVisibleTab(sender.tab?.windowId, { format: 'png' })
        .then((dataUrl) => ({ dataUrl }))
        .catch((error) => ({
          error: error instanceof Error ? error.message : String(error),
        }));
    }

    const modelMetaMessage = message as ModelMetaMessage;
    if (modelMetaMessage.type === 'ytr_openrouter_model_meta') {
      const modelId = modelMetaMessage.model?.trim();
      if (!modelId) {
        return Promise.resolve({ error: 'Missing model id.' });
      }

      return fetchOpenRouterModels()
        .then((models) => {
          const card = findModelCard(models, modelId);
          const provider = extractModelProvider(card, modelId);
          return {
            model: card?.id || modelId,
            name: card?.name || modelId,
            provider,
            iconUrl: typeof card?.icon_url === 'string'
              ? card.icon_url
              : typeof card?.logo_url === 'string'
                ? card.logo_url
                : undefined,
          };
        })
        .catch((error) => {
          void appendExtensionLog({
            type: 'ytr_extension_log',
            level: 'error',
            area: 'ai.web',
            message: 'web enrichment crashed',
            data: { error: error instanceof Error ? error.message : String(error) },
          }, sender);
          return {
            error: error instanceof Error ? error.message : String(error),
          };
        });
    }

    const enrichmentMessage = message as AiEnrichmentMessage;
    if (enrichmentMessage.type === 'ytr_ai_enrich_context') {
      const locale = enrichmentMessage.locale === 'ru' ? 'ru' : 'en';
      const maxSnippets = Math.min(Math.max(enrichmentMessage.maxSnippets || 4, 1), 12);
      void appendExtensionLog({
        type: 'ytr_extension_log',
        level: 'info',
        area: 'ai.web',
        message: 'web enrichment requested',
        data: {
          title: enrichmentMessage.title,
          channel: enrichmentMessage.channel,
          prompt: enrichmentMessage.prompt,
          descriptionChars: enrichmentMessage.description?.length || 0,
          linkCount: Array.isArray(enrichmentMessage.links) ? enrichmentMessage.links.length : 0,
        },
      }, sender);

      return gatherAiWebSnippets(
        enrichmentMessage.title || '',
        enrichmentMessage.channel || '',
        enrichmentMessage.prompt || '',
        locale,
        enrichmentMessage.description || '',
        Array.isArray(enrichmentMessage.links) ? enrichmentMessage.links : [],
        maxSnippets,
      )
        .then(({ snippets, queries }) => {
          void appendExtensionLog({
            type: 'ytr_extension_log',
            level: snippets.length ? 'info' : 'warn',
            area: 'ai.web',
            message: 'web enrichment completed',
            data: { queryCount: queries.length, queries, snippetCount: snippets.length },
          }, sender);
          return { snippets, queries };
        })
        .catch((error) => ({
          error: error instanceof Error ? error.message : String(error),
        }));
    }

    const openRouterMessage = message as OpenRouterMessage;
    if (openRouterMessage.type === 'ytr_ai_chat') {
      const apiKey = sanitizeOpenRouterApiKey(openRouterMessage.apiKey);
      const model = openRouterMessage.model?.trim();
      const messages = sanitizeChatMessages(openRouterMessage.messages);

      if (!apiKey) return Promise.resolve({ error: 'Missing AI API key.' });
      if (!model) return Promise.resolve({ error: 'Missing AI model id.' });
      if (!messages.length) return Promise.resolve({ error: 'Missing chat messages.' });

      return requestAiCompletion({
        provider: openRouterMessage.provider || 'openrouter',
        endpoint: openRouterMessage.endpoint || '',
        apiKey,
        model,
        messages,
        temperature: openRouterMessage.temperature,
        maxTokens: openRouterMessage.maxTokens,
      });
    }

    if (openRouterMessage.type === 'ytr_openrouter_chat') {
      const apiKey = sanitizeOpenRouterApiKey(openRouterMessage.apiKey);
      const model = openRouterMessage.model?.trim();
      const messages = sanitizeChatMessages(openRouterMessage.messages);

      if (!apiKey) {
        return Promise.resolve({ error: 'Missing OpenRouter API key.' });
      }
      if (!model) {
        return Promise.resolve({ error: 'Missing OpenRouter model id.' });
      }
      if (!messages.length) {
        return Promise.resolve({ error: 'Missing chat messages.' });
      }

      void appendExtensionLog({
        type: 'ytr_extension_log',
        level: 'info',
        area: 'ai.openrouter.chat',
        message: 'chat request started',
        data: {
          model,
          messageCount: messages.length,
          promptChars: messages.reduce((sum, entry) => sum + entry.content.length, 0),
          key: redactForLog(apiKey),
        },
      }, sender);

      return requestOpenRouterCompletion(apiKey, model, messages, openRouterMessage.temperature, openRouterMessage.maxTokens)
        .then((result) => {
          void appendExtensionLog({
            type: 'ytr_extension_log',
            level: result.error ? 'warn' : 'info',
            area: 'ai.openrouter.chat',
            message: result.error ? 'chat request failed' : 'chat request completed',
            data: { model: result.model || model, textChars: result.text?.length || 0, error: result.error },
          }, sender);
          return result;
        })
        .catch((error) => {
          void appendExtensionLog({
            type: 'ytr_extension_log',
            level: 'error',
            area: 'ai.openrouter.chat',
            message: 'chat request crashed',
            data: { model, error: error instanceof Error ? error.message : String(error) },
          }, sender);
          return {
            error: error instanceof Error ? error.message : String(error),
          };
        });
    }

    const downloadUrlMessage = message as DownloadUrlMessage;
    if (downloadUrlMessage.type === 'ytr_download_url') {
      const requestUrl = downloadUrlMessage.url?.trim();
      if (!requestUrl || !/^https?:\/\//i.test(requestUrl)) {
        return Promise.resolve({ ok: false, error: 'Unsupported download URL.' });
      }

      return browser.downloads.download({
        url: requestUrl,
        filename: downloadUrlMessage.filename || undefined,
        saveAs: false,
        conflictAction: 'uniquify',
      })
        .then((downloadId) => ({ ok: true, downloadId }))
        .catch((error) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }));
    }

    const fetchImageMessage = message as FetchImageDataUrlMessage;
    if (fetchImageMessage.type === 'ytr_fetch_image_data_url') {
      const requestUrl = fetchImageMessage.url?.trim();
      if (!requestUrl || !/^https?:\/\//i.test(requestUrl)) {
        return Promise.resolve({ error: 'Unsupported image URL.' });
      }

      return fetch(requestUrl, {
        credentials: 'omit',
        cache: 'force-cache',
      })
        .then(async (response) => {
          if (!response.ok) return { error: `Fetch failed (${response.status}).` };
          const blob = await response.blob();
          const buffer = await blob.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(buffer);
          const chunkSize = 0x8000;
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
          }
          return {
            dataUrl: `data:${blob.type || 'image/png'};base64,${btoa(binary)}`,
          };
        })
        .catch((error) => ({
          error: error instanceof Error ? error.message : String(error),
        }));
    }

    const fetchTextMessage = message as FetchTextMessage;
    if (fetchTextMessage.type !== 'ytr_fetch_text') {
      return undefined;
    }

    const requestUrl = fetchTextMessage.url?.trim();
    if (!requestUrl || !isAllowedInternalFetchUrl(requestUrl)) {
      return Promise.resolve({ error: 'Unsupported fetch URL.' });
    }

    let fetchPath = '';
    try {
      fetchPath = new URL(requestUrl).pathname;
    } catch {
      fetchPath = '';
    }
    const shouldLogFetch = fetchPath === '/watch' || fetchPath === '/api/timedtext';
    if (shouldLogFetch) {
      void appendExtensionLog({
        type: 'ytr_extension_log',
        level: 'debug',
        area: 'ai.transcript.fetch',
        message: 'background text fetch started',
        data: { path: fetchPath, urlChars: requestUrl.length },
      }, sender);
    }

    return fetch(requestUrl, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          if (shouldLogFetch) {
            void appendExtensionLog({
              type: 'ytr_extension_log',
              level: 'warn',
              area: 'ai.transcript.fetch',
              message: 'background text fetch failed',
              data: { path: fetchPath, status: response.status },
            }, sender);
          }
          return {
            error: `Fetch failed (${response.status}).`,
          };
        }

        const text = await response.text();
        if (shouldLogFetch) {
          void appendExtensionLog({
            type: 'ytr_extension_log',
            level: 'debug',
            area: 'ai.transcript.fetch',
            message: 'background text fetch completed',
            data: { path: fetchPath, chars: text.length },
          }, sender);
        }
        return {
          text,
        };
      })
      .catch((error) => {
        if (shouldLogFetch) {
          void appendExtensionLog({
            type: 'ytr_extension_log',
            level: 'error',
            area: 'ai.transcript.fetch',
            message: 'background text fetch crashed',
            data: { path: fetchPath, error: error instanceof Error ? error.message : String(error) },
          }, sender);
        }
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      });
  });
});
