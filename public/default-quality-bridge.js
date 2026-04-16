(function () {
  if (window.__ytrDefaultQualityBridgeInstalled) return;
  window.__ytrDefaultQualityBridgeInstalled = true;

  var QUALITY_BY_SETTING = {
    '4320p': 'highres',
    '2160p': 'hd2160',
    '1440p': 'hd1440',
    '1080p': 'hd1080',
    '720p': 'hd720',
    '480p': 'large',
    '360p': 'medium',
    '240p': 'small',
    '144p': 'tiny'
  };

  var QUALITY_ORDER = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  var VIDEO_EVENTS = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'durationchange', 'waiting'];

  var targetQuality = 'auto';
  var applyDelayTimer = null;
  var retryTimer = null;
  var playerObserver = null;
  var videoSourceObserver = null;
  var observedVideo = null;

  function clearTimers() {
    if (applyDelayTimer) {
      clearTimeout(applyDelayTimer);
      applyDelayTimer = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function getPlayer() {
    return document.querySelector('div#movie_player, div#shorts-player');
  }

  function getMainVideo() {
    var selectors = [
      '#movie_player video.html5-main-video',
      '#movie_player .html5-video-player video',
      '#shorts-player video.html5-main-video',
      '#shorts-player video',
      'ytd-player #movie_player video',
      '#player video.html5-main-video',
      '#player video'
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var found = document.querySelector(selectors[i]);
      if (found instanceof HTMLVideoElement) return found;
    }

    var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
    for (var j = 0; j < videos.length; j += 1) {
      var video = videos[j];
      if (!(video instanceof HTMLVideoElement)) continue;
      if (video.classList.contains('html5-main-video')) return video;
      if (video.closest && video.closest('#movie_player, #shorts-player, ytd-player, #player')) return video;
    }

    return null;
  }

  function getCurrentPlaybackQuality(player) {
    if (!player || typeof player.getPlaybackQuality !== 'function') return '';
    try {
      return player.getPlaybackQuality() || '';
    } catch (_error) {
      return '';
    }
  }

  function getAvailableQualityLevels(player) {
    if (!player || typeof player.getAvailableQualityLevels !== 'function') return [];

    try {
      return (player.getAvailableQualityLevels() || []).filter(function (quality) {
        return quality && quality !== 'auto' && QUALITY_ORDER.indexOf(quality) !== -1;
      });
    } catch (_error) {
      return [];
    }
  }

  function chooseClosestQuality(setting, availableQualities) {
    var selectedQuality = QUALITY_BY_SETTING[setting];
    if (!selectedQuality || !availableQualities.length) return null;
    if (availableQualities.indexOf(selectedQuality) !== -1) return selectedQuality;

    var selectedIndex = QUALITY_ORDER.indexOf(selectedQuality);
    if (selectedIndex === -1) return null;

    var mapped = availableQualities
      .map(function (quality) {
        return { quality: quality, index: QUALITY_ORDER.indexOf(quality) };
      })
      .filter(function (entry) {
        return entry.index !== -1;
      });

    if (!mapped.length) return null;

    var lowerQuality = mapped
      .filter(function (entry) {
        return entry.index >= selectedIndex;
      })
      .sort(function (left, right) {
        return left.index - right.index;
      })[0];

    if (lowerQuality) return lowerQuality.quality;

    var higherQuality = mapped
      .filter(function (entry) {
        return entry.index < selectedIndex;
      })
      .sort(function (left, right) {
        return right.index - left.index;
      })[0];

    return higherQuality ? higherQuality.quality : null;
  }

  function applyPreferredQuality() {
    if (!targetQuality || targetQuality === 'auto') return { status: 'idle', quality: null };

    var player = getPlayer();
    if (!player) return { status: 'missing-player', quality: null };

    var availableQualities = getAvailableQualityLevels(player);
    if (!availableQualities.length) return { status: 'missing-levels', quality: null };

    var closestQuality = chooseClosestQuality(targetQuality, availableQualities);
    if (!closestQuality) return { status: 'no-match', quality: null };

    try {
      if (player.dataset) {
        player.dataset.defaultQuality = closestQuality;
      }
    } catch (_error) {
      // Ignore dataset failures.
    }

    try {
      if (typeof player.setPlaybackQualityRange === 'function') {
        try {
          player.setPlaybackQualityRange(closestQuality, closestQuality);
        } catch (_rangeError) {
          player.setPlaybackQualityRange(closestQuality);
        }
      }
      if (typeof player.setPlaybackQuality === 'function') {
        player.setPlaybackQuality(closestQuality);
      }
    } catch (_error) {
      return { status: 'apply-failed', quality: closestQuality };
    }

    return {
      status: getCurrentPlaybackQuality(player) === closestQuality ? 'matched' : 'requested',
      quality: closestQuality
    };
  }

  function scheduleApply(delay) {
    clearTimers();
    if (!targetQuality || targetQuality === 'auto') return;

    applyDelayTimer = window.setTimeout(function () {
      applyDelayTimer = null;
      var attempts = 0;

      function tick() {
        if (!targetQuality || targetQuality === 'auto') return;

        attempts += 1;
        var result = applyPreferredQuality();
        var keepRetrying = result.status !== 'matched' || attempts < 3;

        if (!keepRetrying || attempts >= 24) {
          retryTimer = null;
          return;
        }

        var nextDelay = attempts < 6
          ? 220
          : attempts < 14
            ? 420
            : 900;
        retryTimer = window.setTimeout(tick, nextDelay);
      }

      tick();
    }, delay || 0);
  }

  function ensurePlayerObserver() {
    if (playerObserver || !document.documentElement) return;

    playerObserver = new MutationObserver(function () {
      if (!targetQuality || targetQuality === 'auto') return;
      scheduleApply(120);
      observeVideoSource();
    });

    playerObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function detachVideoListeners() {
    if (!(observedVideo instanceof HTMLVideoElement)) return;
    VIDEO_EVENTS.forEach(function (eventName) {
      observedVideo.removeEventListener(eventName, handleQualitySignal);
    });
  }

  function disconnectVideoSourceObserver() {
    detachVideoListeners();
    if (videoSourceObserver) {
      videoSourceObserver.disconnect();
      videoSourceObserver = null;
    }
    observedVideo = null;
  }

  function observeVideoSource() {
    var video = getMainVideo();
    if (!(video instanceof HTMLVideoElement)) {
      disconnectVideoSourceObserver();
      return;
    }

    if (observedVideo === video && videoSourceObserver) return;

    disconnectVideoSourceObserver();
    observedVideo = video;
    videoSourceObserver = new MutationObserver(function () {
      if (!targetQuality || targetQuality === 'auto') return;
      scheduleApply(80);
    });

    videoSourceObserver.observe(video, {
      attributes: true,
      attributeFilter: ['src']
    });

    VIDEO_EVENTS.forEach(function (eventName) {
      video.addEventListener(eventName, handleQualitySignal);
    });
  }

  function handleQualitySignal() {
    if (!targetQuality || targetQuality === 'auto') return;
    observeVideoSource();
    scheduleApply(80);
  }

  function handleQualityEvent(event) {
    var detail = event && event.detail ? event.detail : {};
    targetQuality = typeof detail.quality === 'string' ? detail.quality : 'auto';

    if (!targetQuality || targetQuality === 'auto') {
      clearTimers();
      disconnectVideoSourceObserver();
      return;
    }

    ensurePlayerObserver();
    observeVideoSource();
    scheduleApply(40);
  }

  window.addEventListener('ytr:set-default-quality', handleQualityEvent);
  document.addEventListener('ytr:set-default-quality', handleQualityEvent, true);
  if (document.documentElement) {
    document.documentElement.addEventListener('ytr:set-default-quality', handleQualityEvent, true);
  }

  document.addEventListener('yt-navigate-finish', handleQualitySignal, true);
  document.addEventListener('yt-player-updated', handleQualitySignal, true);
  document.addEventListener('yt-page-data-updated', handleQualitySignal, true);
  document.addEventListener('play', handleQualitySignal, true);
  document.addEventListener('readystatechange', handleQualitySignal, true);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) handleQualitySignal();
  }, true);

  ensurePlayerObserver();
  observeVideoSource();
})();
