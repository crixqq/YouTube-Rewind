# YouTube Rewind v0.4.0

This release is a major update over `v0.3.0`, focused on popup reliability, fullscreen preview tools, richer customization, and a much broader settings surface.

## Highlights

- Rebuilt popup interaction flow so controls respond consistently and profiles work reliably.
- Added a responsive standalone settings tab for easier editing on large screens.
- Added fullscreen thumbnail preview with zoom, pan, copy, download, and variant switching.
- Added optional frame screenshot capture for the current video frame without player chrome.
- Expanded custom logo support to images, GIFs, and video files, with adjustable logo size.
- Added beta/labs settings, including homepage reveal animation and avatar live-redirect control.
- Improved Chromium and Firefox packaging, permissions, and release artifacts.

## UI and settings improvements

- Refined popup layout, motion, search, sections, sliders, chips, toggles, and avatar-shape controls.
- Added smarter settings search and improved standalone workspace layout.
- Beta feature state is now saved inside custom profiles.
- Updated built-in profiles so they make fuller use of the extension feature set.
- Added favicon support for popup-related pages.

## Watch page and media tools

- Added native-style download and preview controls near the YouTube action bar.
- Added fullscreen thumbnail overlay with cleaner layout, arrow navigation, zoom controls, and copy/download actions.
- Added frame screenshot capture with download or preview flow.
- Improved default quality enforcement so preferred quality is re-applied more reliably after navigation and player readiness events.
- Improved watch-page integration for custom logos and logo media playback.

## Content script and homepage behavior

- Added optional homepage reveal animation for cards, including SPA navigation and viewport re-entry.
- Added optional disabling of avatar live redirects on the homepage.
- Improved watch timer, overlays, and related page-state handling.

## Import, logo, docs, and release prep

- Improved import and custom-logo pages, including clipboard-based flows.
- Updated README for the `0.4.0` release line and added a rounded interface preview image.
- Added local assistant/workspace files to `.gitignore`.
- Prepared Chrome zip, Firefox zip, Firefox xpi, and source archive artifacts for release.
