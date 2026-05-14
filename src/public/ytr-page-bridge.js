(() => {
  if (window.__ytrPageBridgeInstalled) return;
  window.__ytrPageBridgeInstalled = true;

  const REQUEST_EVENT = 'ytr-page-bridge-request';
  const RESPONSE_EVENT = 'ytr-page-bridge-response';
  let autoSkipEnabled = false;
  let autoSkipTimer = null;
  let autoSkipObserver = null;
  let lastSkipAt = 0;
  let lastTranscriptEndpointSource = '';
  const observedTimedTextResponses = [];
  const observedInnertubeTranscriptResponses = [];
  const MAX_OBSERVED_TIMEDTEXT_RESPONSES = 16;

  const normalizeTimedTextUrl = (rawUrl) => {
    if (!rawUrl) return '';
    try {
      const url = new URL(String(rawUrl), window.location.href);
      return /(?:^|\.)youtube\.com$/i.test(url.hostname) && url.pathname === '/api/timedtext'
        ? url.toString()
        : '';
    } catch {
      return '';
    }
  };

  const normalizeInnertubeTranscriptUrl = (rawUrl) => {
    if (!rawUrl) return '';
    try {
      const url = new URL(String(rawUrl), window.location.href);
      return /(?:^|\.)youtube\.com$/i.test(url.hostname) && url.pathname === '/youtubei/v1/get_transcript'
        ? url.toString()
        : '';
    } catch {
      return '';
    }
  };

  const isLikelyTranscriptText = (text) => {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    return trimmed.includes('"events"')
      || trimmed.includes('<transcript')
      || trimmed.includes('<text')
      || /^WEBVTT/i.test(trimmed);
  };

  const createTrackFromTimedTextUrl = (rawUrl) => {
    try {
      const url = new URL(rawUrl, window.location.href);
      const languageCode = url.searchParams.get('lang') || url.searchParams.get('tlang') || '';
      const kind = url.searchParams.get('kind') || '';
      const label = url.searchParams.get('name') || languageCode || 'Observed transcript';
      return {
        baseUrl: url.toString(),
        languageCode,
        kind,
        label,
      };
    } catch {
      return {
        baseUrl: rawUrl,
        languageCode: '',
        kind: '',
        label: 'Observed transcript',
      };
    }
  };

  const rememberTimedTextResponse = (rawUrl, text) => {
    const url = normalizeTimedTextUrl(rawUrl);
    if (!url || !isLikelyTranscriptText(text)) return;

    const existingIndex = observedTimedTextResponses.findIndex((entry) => entry.url === url);
    const entry = {
      url,
      text,
      track: createTrackFromTimedTextUrl(url),
      capturedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      observedTimedTextResponses.splice(existingIndex, 1);
    }
    observedTimedTextResponses.unshift(entry);
    observedTimedTextResponses.splice(MAX_OBSERVED_TIMEDTEXT_RESPONSES);
  };

  const rememberInnertubeTranscriptResponse = (rawUrl, text) => {
    const url = normalizeInnertubeTranscriptUrl(rawUrl);
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!url || !trimmed.includes('transcript')) return;

    const existingIndex = observedInnertubeTranscriptResponses.findIndex((entry) => entry.url === url);
    const entry = {
      url,
      text,
      capturedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      observedInnertubeTranscriptResponses.splice(existingIndex, 1);
    }
    observedInnertubeTranscriptResponses.unshift(entry);
    observedInnertubeTranscriptResponses.splice(MAX_OBSERVED_TIMEDTEXT_RESPONSES);
  };

  const installTimedTextNetworkObserver = () => {
    if (window.__ytrTimedTextNetworkObserverInstalled) return;
    window.__ytrTimedTextNetworkObserverInstalled = true;

    try {
      const originalFetch = window.fetch;
      if (typeof originalFetch === 'function') {
        window.fetch = function ytrObservedFetch(input, init) {
          const rawUrl = typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input?.url || '';
          const normalizedUrl = normalizeTimedTextUrl(rawUrl);
          const normalizedTranscriptUrl = normalizeInnertubeTranscriptUrl(rawUrl);
          return originalFetch.apply(this, arguments).then((response) => {
            if (normalizedUrl && response?.clone) {
              response.clone().text()
                .then((text) => rememberTimedTextResponse(normalizedUrl, text))
                .catch(() => {});
            }
            if (normalizedTranscriptUrl && response?.clone) {
              response.clone().text()
                .then((text) => rememberInnertubeTranscriptResponse(normalizedTranscriptUrl, text))
                .catch(() => {});
            }
            return response;
          });
        };
      }
    } catch {}

    try {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function ytrObservedXhrOpen(method, url) {
        try {
          this.__ytrTimedTextUrl = normalizeTimedTextUrl(url);
          this.__ytrInnertubeTranscriptUrl = normalizeInnertubeTranscriptUrl(url);
        } catch {
          this.__ytrTimedTextUrl = '';
          this.__ytrInnertubeTranscriptUrl = '';
        }
        return originalOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function ytrObservedXhrSend() {
        try {
          if (this.__ytrTimedTextUrl || this.__ytrInnertubeTranscriptUrl) {
            this.addEventListener('load', () => {
              try {
                if (typeof this.responseText === 'string') {
                  if (this.__ytrTimedTextUrl) {
                    rememberTimedTextResponse(this.__ytrTimedTextUrl, this.responseText);
                  }
                  if (this.__ytrInnertubeTranscriptUrl) {
                    rememberInnertubeTranscriptResponse(this.__ytrInnertubeTranscriptUrl, this.responseText);
                  }
                }
              } catch {}
            }, { once: true });
          }
        } catch {}
        return originalSend.apply(this, arguments);
      };
    } catch {}
  };

  installTimedTextNetworkObserver();

  const parseBridgeDetail = (rawDetail) => {
    if (typeof rawDetail === 'string') {
      try {
        return JSON.parse(rawDetail);
      } catch {
        return null;
      }
    }

    if (!rawDetail || typeof rawDetail !== 'object') return null;

    try {
      if ('wrappedJSObject' in rawDetail && rawDetail.wrappedJSObject) {
        return parseBridgeDetail(rawDetail.wrappedJSObject);
      }
    } catch {}

    try {
      return JSON.parse(JSON.stringify(rawDetail));
    } catch {
      return null;
    }
  };

  const getCustomEventDetailSafely = (event) => {
    if (!(event instanceof CustomEvent)) return null;

    try {
      return event.detail;
    } catch {
      return null;
    }
  };

  const extractTextFromRuns = (value) => {
    if (!value) return '';
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (!Array.isArray(value.runs)) return '';
    return value.runs.map((run) => run?.text || '').join('').trim();
  };

  const extractJsonObjectAtIndex = (source, objectStart) => {
    if (typeof source !== 'string') return null;
    if (objectStart < 0 || objectStart >= source.length || source[objectStart] !== '{') return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = objectStart; index < source.length; index += 1) {
      const char = source[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (inString) {
        if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char !== '}') continue;
      depth -= 1;
      if (depth === 0) {
        return source.slice(objectStart, index + 1);
      }
    }

    return null;
  };

  const extractJsonObjectAfterKey = (source, key) => {
    if (typeof source !== 'string') return null;
    const keyIndex = source.indexOf(key);
    if (keyIndex < 0) return null;
    let valueStart = keyIndex + key.length;
    while (valueStart < source.length && /\s/.test(source[valueStart])) {
      valueStart += 1;
    }
    if (source[valueStart] !== '{') return null;
    return extractJsonObjectAtIndex(source, valueStart);
  };

  const extractJsonObjectsAfterKey = (source, key, maxMatches = 16) => {
    if (typeof source !== 'string') return [];
    const results = [];
    let searchIndex = 0;

    while (results.length < maxMatches) {
      const keyIndex = source.indexOf(key, searchIndex);
      if (keyIndex < 0) break;

      let valueStart = keyIndex + key.length;
      while (valueStart < source.length && /\s/.test(source[valueStart])) {
        valueStart += 1;
      }

      if (source[valueStart] !== '{') {
        searchIndex = keyIndex + key.length;
        continue;
      }

      const object = extractJsonObjectAtIndex(source, valueStart);
      if (object) {
        results.push(object);
      }

      searchIndex = valueStart + 1;
    }

    return results;
  };

  const mapCaptionTrack = (track) => ({
    baseUrl: typeof track?.baseUrl === 'string' ? track.baseUrl : '',
    languageCode: typeof track?.languageCode === 'string' ? track.languageCode : '',
    kind: typeof track?.kind === 'string' ? track.kind : '',
    label: extractTextFromRuns(track?.name) || track?.languageCode || 'Transcript',
  });

  const formatTranscriptTimestamp = (ms) => {
    const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const extractCaptionTracks = (playerResponse) => {
    const tracklist = playerResponse?.captions?.playerCaptionsTracklistRenderer;
    if (!tracklist || !Array.isArray(tracklist.captionTracks)) return [];
    return tracklist.captionTracks
      .map(mapCaptionTrack)
      .filter((track) => !!track.baseUrl);
  };

  const extractCaptionTracksFromScriptText = (source) => {
    if (typeof source !== 'string') return [];
    if (!source.includes('playerCaptionsTracklistRenderer') && !source.includes('api/timedtext')) return [];

    for (const tracklistPayload of extractJsonObjectsAfterKey(source, '"playerCaptionsTracklistRenderer":', 48)) {
      try {
        const tracks = (JSON.parse(tracklistPayload)?.captionTracks || [])
          .map(mapCaptionTrack)
          .filter((track) => !!track.baseUrl);
        if (tracks.length) return tracks;
      } catch {
        continue;
      }
    }

    for (const captionsPayload of extractJsonObjectsAfterKey(source, '"captions":', 24)) {
      try {
        const tracks = extractCaptionTracks({ captions: JSON.parse(captionsPayload) });
        if (tracks.length) return tracks;
      } catch {
        continue;
      }
    }

    const timedtextTracks = Array.from(source.matchAll(/https:\/\/www\.youtube\.com\/api\/timedtext[^"]+/g))
      .concat(Array.from(source.matchAll(/https:\\\/\\\/www\.youtube\.com\\\/api\\\/timedtext[^"]+/g)))
      .map((match) => match[0]
        .replace(/\\\//g, '/')
        .replace(/\\u0026/g, '&')
        .replace(/&amp;/g, '&')
        .trim())
      .filter(Boolean)
      .map((rawUrl) => {
        try {
          const url = new URL(rawUrl);
          return {
            baseUrl: url.toString(),
            languageCode: url.searchParams.get('lang') || url.searchParams.get('tlang') || '',
            kind: url.searchParams.get('kind') || '',
            label: url.searchParams.get('name') || url.searchParams.get('lang') || 'Transcript',
          };
        } catch {
          return null;
        }
      })
      .filter((track) => !!track?.baseUrl);

    if (timedtextTracks.length) {
      return timedtextTracks;
    }

    return [];
  };

  const getPlayerResponseCandidates = () => {
    const candidates = [];

    try {
      if (window.ytInitialPlayerResponse) {
        candidates.push(window.ytInitialPlayerResponse);
      }
    } catch {}

    try {
      if (window.ytplayer?.config?.args?.player_response) {
        const raw = window.ytplayer.config.args.player_response;
        candidates.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
      }
    } catch {}

    try {
      const moviePlayer = document.getElementById('movie_player');
      if (moviePlayer && typeof moviePlayer.getPlayerResponse === 'function') {
        candidates.push(moviePlayer.getPlayerResponse());
      }
    } catch {}

    try {
      const ytdPlayer = document.querySelector('ytd-player');
      const data = ytdPlayer?.data;
      if (data?.playerResponse) {
        candidates.push(data.playerResponse);
      }
      if (data?.response?.playerResponse) {
        candidates.push(data.response.playerResponse);
      }
    } catch {}

    return candidates;
  };

  const getCaptionTracks = () => {
    for (const candidate of getPlayerResponseCandidates()) {
      const tracks = extractCaptionTracks(candidate);
      if (tracks.length) return tracks;
    }

    for (const script of Array.from(document.scripts)) {
      const tracks = extractCaptionTracksFromScriptText(script.textContent || '');
      if (tracks.length) return tracks;
    }

    return [];
  };

  const prioritizeCaptionTracks = (tracks, preferredLanguageCodes = []) => {
    const normalizedPreferredCodes = Array.isArray(preferredLanguageCodes)
      ? preferredLanguageCodes
        .filter((value) => typeof value === 'string')
        .map((value) => value.toLowerCase())
      : [];

    return [...tracks]
      .map((track, index) => {
        const normalizedLanguageCode = (track.languageCode || '').toLowerCase();
        const preferredMatch = normalizedPreferredCodes.includes(normalizedLanguageCode);
        const score = [
          preferredMatch && track.kind !== 'asr' ? 40 : 0,
          preferredMatch ? 30 : 0,
          track.kind !== 'asr' ? 20 : 0,
          10,
          -index / 1000,
        ].reduce((sum, value) => sum + value, 0);

        return { track, score };
      })
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.track);
  };

  const getPreferredCaptionTracks = (preferredLanguageCodes = []) => {
    return prioritizeCaptionTracks(getCaptionTracks(), preferredLanguageCodes);
  };

  const fetchCaptionTracksFromInnertubePlayer = async (videoId) => {
    const normalizedVideoId = typeof videoId === 'string' ? videoId.trim() : '';
    if (!normalizedVideoId) return [];

    const apiKey = String(getYtcfgValue('INNERTUBE_API_KEY') || '');
    const clientName = String(getYtcfgValue('INNERTUBE_CLIENT_NAME') || '');
    const clientVersion = String(getYtcfgValue('INNERTUBE_CLIENT_VERSION') || '');
    const visitorData = String(getYtcfgValue('VISITOR_DATA') || '');
    const context = cloneJsonValue(getYtcfgValue('INNERTUBE_CONTEXT'));

    if (!apiKey || !clientVersion || !context) return [];

    if (context?.client && typeof context.client === 'object') {
      if (!context.client.clientName) {
        context.client.clientName = 'WEB';
      }
      if (!context.client.clientVersion) {
        context.client.clientVersion = clientVersion;
      }
      if (visitorData && !context.client.visitorData) {
        context.client.visitorData = visitorData;
      }
      if (!context.client.originalUrl) {
        context.client.originalUrl = `https://www.youtube.com/watch?v=${normalizedVideoId}`;
      }
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Youtube-Client-Version': clientVersion,
    };

    if (clientName) {
      headers['X-Youtube-Client-Name'] = clientName;
    }

    if (visitorData) {
      headers['X-Goog-Visitor-Id'] = visitorData;
    }

    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers,
        body: JSON.stringify({
          context,
          videoId: normalizedVideoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });

      if (!response.ok) return [];
      const payload = await response.json().catch(() => null);
      return extractCaptionTracks(payload);
    } catch {
      return [];
    }
  };

  const getYtcfgValue = (key) => {
    try {
      if (window.ytcfg && typeof window.ytcfg.get === 'function') {
        return window.ytcfg.get(key);
      }
    } catch {}

    return undefined;
  };

  const cloneJsonValue = (value) => {
    if (value == null) return null;

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  };

  const findNestedObjectByKey = (root, key, maxDepth = 16) => {
    if (!root || typeof root !== 'object') return null;

    const stack = [{ value: root, depth: 0 }];
    const seen = new Set();

    while (stack.length) {
      const { value, depth } = stack.pop();
      if (!value || typeof value !== 'object') continue;
      if (seen.has(value)) continue;
      seen.add(value);

      if (Object.prototype.hasOwnProperty.call(value, key) && value[key] && typeof value[key] === 'object') {
        return value[key];
      }

      if (depth >= maxDepth) continue;

      const nestedValues = Array.isArray(value)
        ? value
        : Object.values(value);

      for (let index = nestedValues.length - 1; index >= 0; index -= 1) {
        const candidate = nestedValues[index];
        if (!candidate || typeof candidate !== 'object') continue;
        stack.push({ value: candidate, depth: depth + 1 });
      }
    }

    return null;
  };

  const findTranscriptEndpointParamsInObject = (root, maxDepth = 18) => {
    if (!root || typeof root !== 'object') return '';

    const stack = [{ value: root, depth: 0 }];
    const seen = new Set();

    while (stack.length) {
      const { value, depth } = stack.pop();
      if (!value || typeof value !== 'object') continue;
      if (seen.has(value)) continue;
      seen.add(value);

      if (typeof value?.getTranscriptEndpoint?.params === 'string' && value.getTranscriptEndpoint.params) {
        return value.getTranscriptEndpoint.params;
      }

      if (
        typeof value?.params === 'string'
        && value.params
        && (
          typeof value?.commandMetadata?.webCommandMetadata?.apiUrl === 'string'
          && value.commandMetadata.webCommandMetadata.apiUrl.includes('/get_transcript')
        )
      ) {
        return value.params;
      }

      if (depth >= maxDepth) continue;

      const nestedValues = Array.isArray(value)
        ? value
        : Object.values(value);

      for (let index = nestedValues.length - 1; index >= 0; index -= 1) {
        const candidate = nestedValues[index];
        if (!candidate || typeof candidate !== 'object') continue;
        stack.push({ value: candidate, depth: depth + 1 });
      }
    }

    return '';
  };

  const extractTranscriptEndpointParamsFromScriptText = (source) => {
    if (typeof source !== 'string' || !source.includes('getTranscriptEndpoint')) return '';

    const match = source.match(/"getTranscriptEndpoint"\s*:\s*\{\s*"params"\s*:\s*"([^"]+)"/);
    return match?.[1] || '';
  };

  const getTranscriptEndpointParams = () => {
    const candidates = [];

    try {
      if (window.ytInitialData) {
        candidates.push(window.ytInitialData);
      }
    } catch {}

    try {
      const ytdApp = document.querySelector('ytd-app');
      if (ytdApp?.data) {
        candidates.push(ytdApp.data);
        if (ytdApp.data.response) {
          candidates.push(ytdApp.data.response);
        }
      }
    } catch {}

    try {
      const watchFlexy = document.querySelector('ytd-watch-flexy');
      if (watchFlexy?.data) {
        candidates.push(watchFlexy.data);
        if (watchFlexy.data.response) {
          candidates.push(watchFlexy.data.response);
        }
      }
    } catch {}

    for (const candidate of candidates) {
      const params = findTranscriptEndpointParamsInObject(candidate);
      if (params) return params;
    }

    for (const script of Array.from(document.scripts)) {
      const params = extractTranscriptEndpointParamsFromScriptText(script.textContent || '');
      if (params) return params;
    }

    return '';
  };

  const buildInnertubeRequestParts = (videoId, preferredLanguageCodes = []) => {
    const normalizedVideoId = typeof videoId === 'string' ? videoId.trim() : '';
    const apiKey = String(getYtcfgValue('INNERTUBE_API_KEY') || '');
    const clientName = String(getYtcfgValue('INNERTUBE_CLIENT_NAME') || '');
    const clientVersion = String(getYtcfgValue('INNERTUBE_CLIENT_VERSION') || '');
    const sessionIndex = String(getYtcfgValue('SESSION_INDEX') || '');
    const visitorData = String(getYtcfgValue('VISITOR_DATA') || '');
    const context = cloneJsonValue(getYtcfgValue('INNERTUBE_CONTEXT'));

    if (!normalizedVideoId || !apiKey || !clientVersion || !context) return null;

    const preferredLanguageCode = Array.isArray(preferredLanguageCodes)
      ? preferredLanguageCodes.find((value) => typeof value === 'string' && value.trim()) || ''
      : '';

    if (context?.client && typeof context.client === 'object') {
      if (preferredLanguageCode) {
        context.client.hl = preferredLanguageCode.split('-')[0];
      }
      if (!context.client.clientName) {
        context.client.clientName = 'WEB';
      }
      if (!context.client.clientVersion) {
        context.client.clientVersion = clientVersion;
      }
      if (visitorData && !context.client.visitorData) {
        context.client.visitorData = visitorData;
      }
      context.client.originalUrl = `https://www.youtube.com/watch?v=${normalizedVideoId}`;
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Youtube-Client-Version': clientVersion,
      'X-Origin': window.location.origin,
    };

    if (clientName) {
      headers['X-Youtube-Client-Name'] = clientName;
    }

    if (visitorData) {
      headers['X-Goog-Visitor-Id'] = visitorData;
    }

    if (sessionIndex) {
      headers['X-Goog-AuthUser'] = sessionIndex;
    }

    return {
      normalizedVideoId,
      apiKey,
      context,
      headers,
    };
  };

  const fetchTranscriptEndpointParamsFromInnertubeNext = async (videoId, preferredLanguageCodes = []) => {
    const parts = buildInnertubeRequestParts(videoId, preferredLanguageCodes);
    if (!parts) return '';

    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/next?prettyPrint=false&key=${encodeURIComponent(parts.apiKey)}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: parts.headers,
        body: JSON.stringify({
          context: parts.context,
          videoId: parts.normalizedVideoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });

      if (!response.ok) return '';
      const payload = await response.json().catch(() => null);
      return findTranscriptEndpointParamsInObject(payload);
    } catch {
      return '';
    }
  };

  const getTranscriptDataCandidates = () => {
    const candidates = [];

    try {
      if (window.ytInitialData) {
        candidates.push(window.ytInitialData);
      }
    } catch {}

    try {
      const ytdApp = document.querySelector('ytd-app');
      if (ytdApp?.data) {
        candidates.push(ytdApp.data);
        if (ytdApp.data.response) {
          candidates.push(ytdApp.data.response);
        }
      }
    } catch {}

    try {
      const watchFlexy = document.querySelector('ytd-watch-flexy');
      if (watchFlexy?.data) {
        candidates.push(watchFlexy.data);
        if (watchFlexy.data.response) {
          candidates.push(watchFlexy.data.response);
        }
      }
    } catch {}

    return candidates;
  };

  const extractTextDeep = (value) => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (!value) return '';

    if (Array.isArray(value)) {
      return value
        .map((entry) => extractTextDeep(entry))
        .filter(Boolean)
        .join('');
    }

    if (typeof value !== 'object') return '';
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) {
      return value.runs.map((run) => extractTextDeep(run?.text ?? run)).join('');
    }
    if (typeof value.text === 'string') return value.text;

    const candidates = [
      value.snippet,
      value.segmentText,
      value.cue,
      value.content,
      value.label,
      value.title,
      value.accessibilityData?.label,
    ];

    for (const candidate of candidates) {
      const text = extractTextDeep(candidate);
      if (text) return text;
    }

    return '';
  };

  const normalizeTranscriptText = (value) => extractTextDeep(value)
    .replace(/\s+/g, ' ')
    .trim();

  const resolveTranscriptTimestamp = (...candidates) => {
    for (const candidate of candidates) {
      const text = normalizeTranscriptText(candidate);
      const timestampMatch = text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
      if (timestampMatch?.[0]) {
        return timestampMatch[0];
      }

      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric >= 0) {
        return formatTranscriptTimestamp(numeric);
      }
    }

    return '';
  };

  const createTranscriptTrackDescriptor = (labelOverride = '') => {
    const preferredTrack = getPreferredCaptionTracks()[0] || {
      baseUrl: '',
      languageCode: '',
      kind: '',
      label: 'Transcript',
    };

    return {
      ...preferredTrack,
      label: labelOverride || preferredTrack.label || 'Transcript',
    };
  };

  const buildTranscriptContextFromLines = (track, videoId, entries) => {
    if (!Array.isArray(entries) || !entries.length) return null;

    const lines = [];
    let totalChars = 0;
    let segmentCount = 0;
    let truncated = false;
    const maxTranscriptChars = 36000;

    for (const entry of entries) {
      const timestamp = typeof entry?.timestamp === 'string' ? entry.timestamp.trim() : '';
      const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
      if (!timestamp || !text) continue;

      const line = `[${timestamp}] ${text}`;
      if (totalChars + line.length + 1 > maxTranscriptChars) {
        truncated = true;
        break;
      }

      lines.push(line);
      totalChars += line.length + 1;
      segmentCount += 1;
    }

    return buildTranscriptContext(track, videoId, lines, segmentCount, truncated);
  };

  const readTranscriptContextFromInitialSegments = (segments, videoId, labelOverride = '') => {
    if (!Array.isArray(segments) || !segments.length) return null;

    const entries = [];

    for (const segment of segments) {
      const renderer = segment?.transcriptSegmentRenderer;
      if (!renderer) continue;

      const timestamp = resolveTranscriptTimestamp(
        renderer.startTimeText,
        renderer.startOffsetText,
        renderer.formattedStartOffset,
        renderer.startMs,
      );
      const text = normalizeTranscriptText(
        renderer.snippet || renderer.segmentText || renderer.cue || renderer.content,
      );

      if (!timestamp || !text) continue;
      entries.push({ timestamp, text });
    }

    return buildTranscriptContextFromLines(createTranscriptTrackDescriptor(labelOverride), videoId, entries);
  };

  const readTranscriptContextFromCueGroups = (cueGroups, videoId, labelOverride = '') => {
    if (!Array.isArray(cueGroups) || !cueGroups.length) return null;

    const entries = [];

    for (const cueGroup of cueGroups) {
      const cueRenderer = cueGroup?.transcriptCueGroupRenderer;
      if (!cueRenderer) continue;

      const cues = Array.isArray(cueRenderer.cues) ? cueRenderer.cues : [];
      const fallbackTimestamp = resolveTranscriptTimestamp(
        cueRenderer.formattedStartOffset,
        cueRenderer.startOffsetText,
        cueRenderer.startOffsetMs,
      );

      for (const cue of cues) {
        const item = cue?.transcriptCueRenderer || cue?.transcriptSegmentRenderer || cue;
        const timestamp = resolveTranscriptTimestamp(
          item?.startOffsetText,
          item?.formattedStartOffset,
          item?.startTimeText,
          item?.startMs,
          cueRenderer.formattedStartOffset,
          cueRenderer.startOffsetMs,
        ) || fallbackTimestamp;
        const text = normalizeTranscriptText(
          item?.cue || item?.snippet || item?.segmentText || item?.text || item?.content,
        );

        if (!timestamp || !text) continue;
        entries.push({ timestamp, text });
      }
    }

    return buildTranscriptContextFromLines(createTranscriptTrackDescriptor(labelOverride), videoId, entries);
  };

  const getTranscriptLabelFromSearchPanel = (searchPanel) => {
    const selectedItem = Array.isArray(
      searchPanel?.footer?.transcriptFooterRenderer?.languageMenu?.sortFilterSubMenuRenderer?.subMenuItems,
    )
      ? searchPanel.footer.transcriptFooterRenderer.languageMenu.sortFilterSubMenuRenderer.subMenuItems.find((item) => item?.selected)
      : null;

    return normalizeTranscriptText(
      selectedItem?.title
      || selectedItem?.subtitle
      || searchPanel?.title
      || searchPanel?.header,
    );
  };

  const extractTranscriptContextFromInnertubePayload = (payload, videoId) => {
    if (!payload || typeof payload !== 'object') return null;

    const searchPanel = findNestedObjectByKey(payload, 'transcriptSearchPanelRenderer');
    const labelOverride = getTranscriptLabelFromSearchPanel(searchPanel);
    const initialSegments = Array.isArray(searchPanel?.body?.transcriptSegmentListRenderer?.initialSegments)
      ? searchPanel.body.transcriptSegmentListRenderer.initialSegments
      : Array.isArray(searchPanel?.content?.transcriptSegmentListRenderer?.initialSegments)
        ? searchPanel.content.transcriptSegmentListRenderer.initialSegments
        : [];

    const initialSegmentsContext = readTranscriptContextFromInitialSegments(initialSegments, videoId, labelOverride);
    if (initialSegmentsContext) {
      return initialSegmentsContext;
    }

    const transcriptBody = findNestedObjectByKey(payload, 'transcriptBodyRenderer');
    const cueGroups = Array.isArray(transcriptBody?.cueGroups) ? transcriptBody.cueGroups : [];
    return readTranscriptContextFromCueGroups(cueGroups, videoId, labelOverride);
  };

  const fetchTranscriptContextFromInnertube = async (videoId, preferredLanguageCodes = []) => {
    let params = getTranscriptEndpointParams();
    lastTranscriptEndpointSource = params ? 'page-data' : '';
    if (!params) {
      params = await fetchTranscriptEndpointParamsFromInnertubeNext(videoId, preferredLanguageCodes);
      lastTranscriptEndpointSource = params ? 'innertube-next' : '';
    }
    if (!params) return null;
    const parts = buildInnertubeRequestParts(videoId, preferredLanguageCodes);
    if (!parts) return null;

    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false&key=${encodeURIComponent(parts.apiKey)}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: parts.headers,
        body: JSON.stringify({
          context: parts.context,
          params,
        }),
      });

      if (!response.ok) return null;
      const payload = await response.json().catch(() => null);
      return extractTranscriptContextFromInnertubePayload(payload, videoId);
    } catch {
      return null;
    }
  };

  const fetchTranscriptRawText = async (rawUrl) => {
    try {
      const response = await fetch(rawUrl, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return '';
      return await response.text();
    } catch {
      return '';
    }
  };

  const buildTranscriptContext = (track, videoId, lines, segmentCount, truncated) => {
    if (!Array.isArray(lines) || !lines.length) return null;

    return {
      videoId: typeof videoId === 'string' ? videoId : '',
      languageCode: track.languageCode || '',
      label: track.label || track.languageCode || 'Transcript',
      isAutoGenerated: track.kind === 'asr',
      text: lines.join('\n'),
      segmentCount,
      truncated: !!truncated,
    };
  };

  const fetchTranscriptContextFromTrack = async (track, videoId) => {
    const maxTranscriptChars = 36000;

    try {
      const transcriptUrl = new URL(track.baseUrl);
      transcriptUrl.searchParams.set('fmt', 'json3');
      const jsonText = await fetchTranscriptRawText(transcriptUrl.toString());

      if (jsonText.trim()) {
        const transcriptData = JSON.parse(jsonText);
        const events = Array.isArray(transcriptData?.events) ? transcriptData.events : [];
        const lines = [];
        let totalChars = 0;
        let segmentCount = 0;
        let truncated = false;

        for (const event of events) {
          const text = (Array.isArray(event?.segs) ? event.segs : [])
            .map((segment) => segment?.utf8 || '')
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
          if (!text) continue;

          const line = `[${formatTranscriptTimestamp(event?.tStartMs || 0)}] ${text}`;
          if (totalChars + line.length + 1 > maxTranscriptChars) {
            truncated = true;
            break;
          }

          lines.push(line);
          totalChars += line.length + 1;
          segmentCount += 1;
        }

        const jsonContext = buildTranscriptContext(track, videoId, lines, segmentCount, truncated);
        if (jsonContext) return jsonContext;
      }
    } catch {}

    try {
      const xmlText = await fetchTranscriptRawText(track.baseUrl);
      if (!xmlText.trim()) return null;

      const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');
      if (xmlDoc.querySelector('parsererror')) return null;

      const nodes = Array.from(xmlDoc.querySelectorAll('transcript > text, text'));
      const lines = [];
      let totalChars = 0;
      let segmentCount = 0;
      let truncated = false;

      for (const node of nodes) {
        const startValue = node.getAttribute('start') || node.getAttribute('t') || '0';
        const startSeconds = Number.parseFloat(startValue);
        const rawText = (node.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!rawText) continue;

        const startMs = Number.isFinite(startSeconds)
          ? (node.hasAttribute('start') ? Math.round(startSeconds * 1000) : Math.round(startSeconds))
          : 0;
        const line = `[${formatTranscriptTimestamp(startMs)}] ${rawText}`;
        if (totalChars + line.length + 1 > maxTranscriptChars) {
          truncated = true;
          break;
        }

        lines.push(line);
        totalChars += line.length + 1;
        segmentCount += 1;
      }

      return buildTranscriptContext(track, videoId, lines, segmentCount, truncated);
    } catch {
      return null;
    }
  };

  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const readTranscriptContextFromPanelDom = (videoId, visibleOnly = false) => {
    const panelCandidates = Array.from(document.querySelectorAll(
      'ytd-engagement-panel-section-list-renderer[target-id*="transcript"],' +
      ' ytd-engagement-panel-section-list-renderer[target-id*="searchable-transcript"],' +
      ' ytd-transcript-search-panel-renderer'
    ));
    const panel = panelCandidates.find((candidate) => (!visibleOnly || isVisible(candidate)) && candidate.querySelector(
      'ytd-transcript-segment-renderer, #segments-container, #segments-container ytd-transcript-segment-renderer, [id*="segment"], [class*="segment"]'
    ));
    if (!(panel instanceof HTMLElement)) return null;

    const track = getPreferredCaptionTracks()[0] || {
      baseUrl: '',
      languageCode: '',
      kind: '',
      label: 'Transcript panel',
    };
    const segmentNodes = Array.from(panel.querySelectorAll(
      'ytd-transcript-segment-renderer,' +
      ' #segments-container ytd-transcript-segment-renderer,' +
      ' #segments-container > *,' +
      ' [id*="transcript"] [id*="segment"],' +
      ' [target-id*="transcript"] [class*="segment"]'
    ));
    const lines = [];
    let totalChars = 0;
    let segmentCount = 0;
    let truncated = false;
    const maxTranscriptChars = 36000;

    for (const node of segmentNodes) {
      const timestamp = (
        node.querySelector('#start-offset, .segment-timestamp, [class*="timestamp"]')
          ?.textContent
          ?.replace(/\s+/g, ' ')
          .trim()
        || node.textContent?.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0]
        || ''
      ).trim();

      const rawText = (
        node.querySelector('#segment-text, .segment-text, yt-formatted-string')
          ?.textContent
        || node.textContent
        || ''
      )
        .replace(/\s+/g, ' ')
        .trim();

      const text = timestamp
        ? rawText.replace(timestamp, '').replace(/\s+/g, ' ').trim()
        : rawText;

      if (!timestamp || !text) continue;

      const line = `[${timestamp}] ${text}`;
      if (totalChars + line.length + 1 > maxTranscriptChars) {
        truncated = true;
        break;
      }

      lines.push(line);
      totalChars += line.length + 1;
      segmentCount += 1;
    }

    return buildTranscriptContext(track, videoId, lines, segmentCount, truncated);
  };

  const getTranscriptContext = async (videoId, preferredLanguageCodes = []) => {
    for (const candidate of getTranscriptDataCandidates()) {
      const embeddedContext = extractTranscriptContextFromInnertubePayload(candidate, videoId);
      if (embeddedContext) {
        return embeddedContext;
      }
    }

    const innertubeTranscriptContext = await fetchTranscriptContextFromInnertube(videoId, preferredLanguageCodes);
    if (innertubeTranscriptContext) {
      return innertubeTranscriptContext;
    }

    const panelContext = readTranscriptContextFromPanelDom(videoId, false);
    if (panelContext) {
      return panelContext;
    }

    const preferredTracks = getPreferredCaptionTracks(preferredLanguageCodes);
    for (const track of preferredTracks) {
      const transcriptContext = await fetchTranscriptContextFromTrack(track, videoId);
      if (transcriptContext) {
        return transcriptContext;
      }
    }

    const playerTracks = await fetchCaptionTracksFromInnertubePlayer(videoId);
    for (const track of prioritizeCaptionTracks(playerTracks, preferredLanguageCodes)) {
      const transcriptContext = await fetchTranscriptContextFromTrack(track, videoId);
      if (transcriptContext) {
        return transcriptContext;
      }
    }

    return null;
  };

  const getMoviePlayer = () => document.getElementById('movie_player');

  const isAdShowing = () => {
    const player = getMoviePlayer();
    if (!(player instanceof HTMLElement)) return false;
    const hasVisibleAdUi = Array.from(player.querySelectorAll(
      '.ytp-ad-player-overlay,' +
      ' .ytp-ad-module,' +
      ' .video-ads,' +
      ' .ytp-ad-player-overlay-layout,' +
      ' .ytp-ad-text,' +
      ' .ytp-ad-skip-button,' +
      ' .ytp-ad-skip-button-modern,' +
      ' .ytp-skip-ad-button,' +
      ' .ytp-ad-skip-button-container,' +
      ' .ytp-ad-skip-button-slot'
    )).some((candidate) => isVisible(candidate));
    return player.classList.contains('ad-showing')
      || player.classList.contains('ad-interrupting')
      || hasVisibleAdUi;
  };

  const getSkipLabel = (element) => [
    element?.getAttribute?.('aria-label'),
    element?.getAttribute?.('title'),
    element?.textContent,
  ].filter(Boolean).join(' ').trim();

  const getSkipContainer = (candidate) => {
    if (!(candidate instanceof HTMLElement)) return null;
    const nestedButton = candidate.querySelector(
      'button, [role="button"], a[role="button"], .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .videoAdUiSkipButton'
    );
    if (nestedButton instanceof HTMLElement) {
      return nestedButton;
    }
    return candidate.closest(
      'button, [role="button"], a[role="button"], .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .videoAdUiSkipButton'
    ) || candidate;
  };

  const findVisibleAdSkipButton = () => {
    const selectors = [
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      '.ytp-skip-ad-button',
      '.ytp-skip-ad-button-container',
      '.ytp-ad-skip-button-slot',
      '.videoAdUiSkipButton',
      '.ytp-ad-player-overlay button',
      '.ytp-ad-player-overlay [role="button"]',
      '.video-ads button',
      '.video-ads [role="button"]',
      'button[class*="ytp-ad-skip-button"]',
      'button[class*="skip-ad"]',
      '[role="button"][class*="skip-ad"]',
    ];
    const player = getMoviePlayer();
    if (!(player instanceof HTMLElement)) return null;

    const candidates = Array.from(player.querySelectorAll(selectors.join(', ')));
    candidates.push(...Array.from(
      player.querySelectorAll('.ytp-ad-player-overlay button, .video-ads button, .video-ads [role="button"]'),
    ));

    let best = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      const target = getSkipContainer(candidate);
      if (!(target instanceof HTMLElement)) continue;
      if (!isVisible(target)) continue;
      const label = getSkipLabel(target).toLowerCase();
      const className = typeof target.className === 'string' ? target.className : '';
      const hasSkipSignal = /skip|пропуст/.test(label)
        || /ytp-ad-skip-button|ytp-skip-ad-button|videoAdUiSkipButton|skip-ad/i.test(className);
      if (!hasSkipSignal) continue;
      const score = [
        /skip|пропуст/.test(label) ? 4 : 0,
        target.matches('button') ? 3 : 0,
        /ytp-ad-skip-button|ytp-skip-ad-button|videoAdUiSkipButton|skip-ad/i.test(target.className) ? 2 : 0,
        target.querySelector('.ytp-ad-skip-button-text, .ytp-skip-ad-button__text') ? 1 : 0,
      ].reduce((sum, value) => sum + value, 0);

      if (score > bestScore) {
        best = target;
        bestScore = score;
      }
    }

    return best;
  };

  const tryPlayerSkipApi = () => {
    const player = getMoviePlayer();
    if (!player) return false;

    const candidateMethods = [
      'skipAd',
      'skipAdIfPresent',
      'skipAdIfPossible',
      'triggerAdSkip',
      'onSkipAd',
    ];

    for (const methodName of candidateMethods) {
      const method = player[methodName];
      if (typeof method !== 'function') continue;
      try {
        method.call(player);
        return true;
      } catch {}
    }

    return false;
  };

  const clickLikeUser = (target) => {
    if (!(target instanceof HTMLElement)) return false;

    const pointerInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: target.getBoundingClientRect().left + (target.getBoundingClientRect().width / 2),
      clientY: target.getBoundingClientRect().top + (target.getBoundingClientRect().height / 2),
    };

    try {
      if (typeof window.PointerEvent === 'function') {
        target.dispatchEvent(new PointerEvent('pointerenter', pointerInit));
        target.dispatchEvent(new PointerEvent('pointerover', pointerInit));
        target.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
        target.dispatchEvent(new PointerEvent('pointerup', { ...pointerInit, buttons: 0 }));
      }
    } catch {}

    try {
      target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0 }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0 }));
    } catch {}

    try {
      target.click();
      return true;
    } catch {
      return false;
    }
  };

  const attemptAutoSkip = () => {
    const now = Date.now();
    if (now - lastSkipAt < 180) return false;
    if (!isAdShowing() && !findVisibleAdSkipButton()) return false;

    if (tryPlayerSkipApi()) {
      lastSkipAt = now;
      return true;
    }

    const target = findVisibleAdSkipButton();
    let clicked = false;
    if (target instanceof HTMLElement) {
      const clickTargets = [
        target.querySelector('button, [role="button"], a[role="button"]'),
        target.matches('button, [role="button"], a[role="button"]') ? target : null,
        target.querySelector('.ytp-ad-skip-button-text, .ytp-skip-ad-button__text'),
        target,
        target.firstElementChild,
        target.parentElement,
      ].filter((entry, index, collection) => entry instanceof HTMLElement && collection.indexOf(entry) === index);

      for (const clickTarget of clickTargets) {
        clicked = clickLikeUser(clickTarget) || clicked;
      }
    }

    if (clicked) {
      lastSkipAt = now;
      return true;
    }

    return false;
  };

  const syncAutoSkipObserver = () => {
    if (autoSkipObserver !== null) {
      autoSkipObserver.disconnect();
      autoSkipObserver = null;
    }

    if (!autoSkipEnabled) return;

    const root = document.body || document.documentElement;
    if (!(root instanceof HTMLElement)) return;

    autoSkipObserver = new MutationObserver(() => {
      if (!autoSkipEnabled) return;
      if (!isAdShowing() && !findVisibleAdSkipButton()) return;
      attemptAutoSkip();
    });

    autoSkipObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-label'],
    });
  };

  const syncAutoSkipLoop = () => {
    if (autoSkipTimer !== null) {
      clearInterval(autoSkipTimer);
      autoSkipTimer = null;
    }

    if (!autoSkipEnabled) return;

    autoSkipTimer = window.setInterval(() => {
      if (!autoSkipEnabled) return;
      if (!isAdShowing() && !findVisibleAdSkipButton()) return;
      attemptAutoSkip();
    }, 120);
  };

  const sendResponse = (requestId, payload) => {
    window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
      detail: JSON.stringify({
        requestId,
        ...payload,
      }),
    }));
  };

  window.addEventListener(REQUEST_EVENT, (event) => {
    const detail = parseBridgeDetail(getCustomEventDetailSafely(event));
    const requestId = typeof detail?.requestId === 'string' ? detail.requestId : '';
    if (!requestId || typeof detail?.type !== 'string') return;

    if (detail.type === 'getCaptionTracks') {
      sendResponse(requestId, { tracks: getCaptionTracks() });
      return;
    }

    if (detail.type === 'clickAdSkip') {
      sendResponse(requestId, {
        clicked: attemptAutoSkip(),
        label: getSkipLabel(findVisibleAdSkipButton()),
      });
      return;
    }

    if (detail.type === 'fetchTranscriptText') {
      const rawUrl = typeof detail.url === 'string' ? detail.url.trim() : '';
      if (!rawUrl) {
        sendResponse(requestId, { text: '' });
        return;
      }

      fetch(rawUrl, {
        credentials: 'include',
        cache: 'no-store',
      })
        .then(async (response) => {
          sendResponse(requestId, {
            text: response.ok ? await response.text() : '',
          });
        })
        .catch(() => {
          sendResponse(requestId, { text: '' });
        });
      return;
    }

    if (detail.type === 'getObservedTranscriptTexts') {
      const videoId = typeof detail.videoId === 'string' ? detail.videoId.trim() : '';
      sendResponse(requestId, {
        transcriptContexts: observedInnertubeTranscriptResponses
          .map((entry) => {
            try {
              return extractTranscriptContextFromInnertubePayload(JSON.parse(entry.text), videoId);
            } catch {
              return null;
            }
          })
          .filter(Boolean),
        transcriptTexts: observedTimedTextResponses.map((entry) => ({
          url: entry.url,
          text: entry.text,
          track: entry.track,
          capturedAt: entry.capturedAt,
        })),
      });
      return;
    }

    if (detail.type === 'getTranscriptContext') {
      const videoId = typeof detail.videoId === 'string' ? detail.videoId.trim() : '';
      const preferredLanguageCodes = Array.isArray(detail.preferredLanguageCodes)
        ? detail.preferredLanguageCodes
        : [];

      getTranscriptContext(videoId, preferredLanguageCodes)
        .then((transcriptContext) => {
          sendResponse(requestId, {
            transcriptContext,
            transcriptDebug: {
              captionTrackCount: getCaptionTracks().length,
              endpointParamsAvailable: !!getTranscriptEndpointParams(),
              endpointSource: lastTranscriptEndpointSource,
              observedTimedTextCount: observedTimedTextResponses.length,
              observedInnertubeTranscriptCount: observedInnertubeTranscriptResponses.length,
              panelReadable: !!readTranscriptContextFromPanelDom(videoId, false),
            },
          });
        })
        .catch(() => {
          sendResponse(requestId, {
            transcriptContext: null,
            transcriptDebug: {
              captionTrackCount: getCaptionTracks().length,
              endpointParamsAvailable: !!getTranscriptEndpointParams(),
              endpointSource: lastTranscriptEndpointSource,
              observedTimedTextCount: observedTimedTextResponses.length,
              observedInnertubeTranscriptCount: observedInnertubeTranscriptResponses.length,
              panelReadable: !!readTranscriptContextFromPanelDom(videoId, false),
            },
          });
        });
      return;
    }

    if (detail.type === 'syncAutoSkipAds') {
      autoSkipEnabled = !!detail.enabled;
      syncAutoSkipLoop();
      syncAutoSkipObserver();
      if (autoSkipEnabled) {
        attemptAutoSkip();
      }
      sendResponse(requestId, {
        enabled: autoSkipEnabled,
      });
    }
  });
})();
