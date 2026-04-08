<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo.png">
    <source media="(prefers-color-scheme: light)" srcset="logo.png">
    <img src="logo.png" alt="YouTube Rewind" height="80">
  </picture>
</p>

<p align="center">
  <b>Clean up YouTube's interface — hide clutter, filter content, customize the look.</b>
</p>

<p align="center">
  Current release: <b>v0.4.0</b>
</p>

<p align="center">
  <a href="../../releases"><img src="https://img.shields.io/github/v/release/crixqq/YouTube-Rewind?style=flat-square&color=c8bfff&labelColor=1c1b20&label=version" alt="Version"></a>
  <a href="../../releases"><img src="https://img.shields.io/github/downloads/crixqq/YouTube-Rewind/total?style=flat-square&color=c8bfff&labelColor=1c1b20&label=downloads" alt="Downloads"></a>
  <a href="https://addons.mozilla.org/firefox/addon/youtube-rewind/"><img src="https://img.shields.io/amo/users/youtube-rewind?style=flat-square&color=c8bfff&labelColor=1c1b20&label=firefox%20users" alt="Firefox Users"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/crixqq/YouTube-Rewind?style=flat-square&color=c8bfff&labelColor=1c1b20" alt="License"></a>
  <a href="../../stargazers"><img src="https://img.shields.io/github/stars/crixqq/YouTube-Rewind?style=flat-square&color=c8bfff&labelColor=1c1b20" alt="Stars"></a>
</p>

<p align="center">
  <a href="https://addons.mozilla.org/firefox/addon/youtube-rewind/">
    <img src="https://img.shields.io/badge/Firefox_Add--ons-Install-c8bfff?style=for-the-badge&logo=firefoxbrowser&logoColor=white&labelColor=1c1b20" alt="Firefox Add-ons">
  </a>
  &nbsp;
  <a href="../../releases">
    <img src="https://img.shields.io/badge/GitHub_Releases-Download-c8bfff?style=for-the-badge&logo=github&logoColor=white&labelColor=1c1b20" alt="GitHub Releases">
  </a>
  &nbsp;
  <a href="https://t.me/ytrewind_extension">
    <img src="https://img.shields.io/badge/Telegram-Channel-c8bfff?style=for-the-badge&logo=telegram&logoColor=white&labelColor=1c1b20" alt="Telegram">
  </a>
</p>

<p align="center">
  <img src="docs/interface-example-rounded.png" alt="YouTube Rewind interface example" width="920">
</p>

---

## <img src="docs/icons/overview.svg" width="18" height="18" alt=""> Overview

This README reflects the current `0.4.0` release line, including standalone settings, fullscreen preview tools, frame screenshots, custom logo media support, and beta toggles that can be saved into profiles.

YouTube Rewind is made for people who want YouTube to feel calmer, cleaner, and more personal without losing the parts that matter.

- <img src="docs/icons/bullet_filter.svg" width="16" height="16" alt=""> Hide clutter across the homepage, search results, top bar, watch page, and sidebar
- <img src="docs/icons/bullet_profiles.svg" width="16" height="16" alt=""> Save presets and custom profiles, including beta/labs setups
- <img src="docs/icons/bullet_preview.svg" width="16" height="16" alt=""> Preview, copy, and download thumbnails in fullscreen
- <img src="docs/icons/bullet_screenshot.svg" width="16" height="16" alt=""> Capture clean video-frame screenshots
- <img src="docs/icons/bullet_appearance.svg" width="16" height="16" alt=""> Customize thumbnails, avatar shapes, banners, player layout, and even the YouTube logo
- <img src="docs/icons/bullet_languages.svg" width="16" height="16" alt=""> Use the settings UI in 11 languages

> Most settings apply instantly, so you can see the result right away without reloading YouTube.

---

## <img src="docs/icons/features.svg" width="18" height="18" alt=""> Features

<details open>
<summary><b><img src="docs/icons/profiles.svg" width="16" height="16" alt=""> Profiles</b></summary>

| | |
|---|---|
| **Built-in Profiles** | Instantly apply a preset: Focus (grayscale thumbnails, watch timer), Minimal (aggressive clutter removal), or Clean (light declutter) |
| **Custom Profiles** | Save your current settings as a named profile, import profiles from file, switch between them with one click |
| **Profile Scope** | Custom profiles now remember beta/labs options too, so experimental setups can be restored in one tap |

</details>

<details open>
<summary><b><img src="docs/icons/player.svg" width="16" height="16" alt=""> Player</b></summary>

| | |
|---|---|
| **Playback Speed** | Set a default playback speed (0.25x–5.0x) applied to every video |
| **Default Quality** | Force a preferred video quality (144p–8K) — YouTube will use the closest available |
| **Classic Player** | Brings back the classic gradient under player controls, removes pill-shaped backgrounds, hides quick action buttons above the progress bar |
| **Wide Player** | Removes width limits — player, metadata, and recommendations fill the full page |
| **Disable Description Color** | Removes the adaptive color tint and hover effects from the description area |
| **Classic Like/Dislike Icons** | Replaces YouTube's like/dislike icons with the classic Material Icons thumbs-up/thumbs-down style — works on the watch page, comments, and posts |

</details>

<details open>
<summary><b><img src="docs/icons/watch_page.svg" width="16" height="16" alt=""> Watch Page</b></summary>

| | |
|---|---|
| **Video Buttons** | Hide individual video action buttons: Join, Subscribe, Like/Dislike, Share, Download, Clip/Remix, Thanks, Save |
| **Banner Style** | Change channel banner appearance: default or sharp (no rounding) |

</details>

<details open>
<summary><b><img src="docs/icons/watch_timer.svg" width="16" height="16" alt=""> Watch Timer</b></summary>

| | |
|---|---|
| **Session Timer** | Track how long you've been watching YouTube today — displayed as a floating overlay |
| **Daily Time Limit** | Set a daily limit (up to 480 minutes) — get a blocking overlay when you exceed it |
| **Block Repeat Videos** | Optionally prevent rewatching the same video after the time limit is reached |

</details>

<details open>
<summary><b><img src="docs/icons/homepage.svg" width="16" height="16" alt=""> Homepage</b></summary>

| | |
|---|---|
| **Videos Per Row** | Set how many videos appear per row (1–8), or keep YouTube's default |
| **Content Filter** | Hide Shorts, Posts, Mixes, Breaking News, Latest Posts, Playables, "Explore more topics", "New" badges, and the filter chips bar |

</details>

<details open>
<summary><b><img src="docs/icons/search.svg" width="16" height="16" alt=""> Search</b></summary>

| | |
|---|---|
| **Search Filter** | Hide Shorts, Channels, and "People also watched" shelves from search results |

</details>

<details open>
<summary><b><img src="docs/icons/top_bar.svg" width="16" height="16" alt=""> Top Bar</b></summary>

| | |
|---|---|
| **Hide Elements** | Hide Create button, voice search, search bar, notifications, and country code from the top bar |
| **Custom Logo** | Replace the YouTube logo with your own image, GIF, or video via a dedicated upload page — drag & drop or pick a file, with instant preview |
| **Logo Size** | Adjust the custom logo scale directly in settings without re-uploading the media |
| **Hide Logo Animations** | Disable YouTube's event/holiday logo animations (Yoodle) — auto-enabled when custom logo is set |

</details>

<details open>
<summary><b><img src="docs/icons/sidebar.svg" width="16" height="16" alt=""> Sidebar</b></summary>

| | |
|---|---|
| **Sidebar Filter** | Hide Subscriptions, You, Explore, "More from YouTube", Report history, and footer from the left sidebar |

</details>

<details open>
<summary><b><img src="docs/icons/appearance.svg" width="16" height="16" alt=""> Appearance</b></summary>

| | |
|---|---|
| **Avatar Shapes** | 9 shapes: circle (default), squircle, rounded square, square, diamond, hexagon, octagon, clover, flower |
| **Thumbnail Effects** | Reduce distractions: pixelate, blur, grayscale, or hide video thumbnails everywhere (hover reveal is optional) |
| **Thumbnail Shapes** | Change the shape of video thumbnails: sharp, rounded, scallop, notched, slanted, arch, or fan |
| **Disable Hover Glow** | Remove the ripple/glow animation on thumbnail hover and prevent metadata text color changes |

</details>

<details open>
<summary><b><img src="docs/icons/settings_data.svg" width="16" height="16" alt=""> Settings Data</b></summary>

| | |
|---|---|
| **Export / Import** | Export settings as JSON or TXT file, copy to clipboard — import from file (drag & drop) or paste from clipboard |
| **Reset** | Reset all settings to defaults with confirmation |
| **Update Checker** | Click the version badge — the extension checks for updates from the source it was installed from |

</details>

<details open>
<summary><b><img src="docs/icons/beta_features.svg" width="16" height="16" alt=""> Beta Features</b></summary>

| | |
|---|---|
| **Thumbnail Download Control** | Adds a native-style action next to the watch page buttons to open a thumbnail menu, preview the image fullscreen, copy it, zoom/pan it, and download it |
| **Thumbnail Carousel Preview** | Fullscreen thumbnail preview now supports switching between available thumbnail variants without leaving the overlay |
| **Frame Screenshot Button** | Capture the current video frame without the player UI, then either download it instantly or open it in the same fullscreen preview interface |
| **Standalone Settings Tab** | Open the extension in a responsive full-page workspace for easier editing on large screens |
| **Homepage Reveal Animation** | Replays a lightweight entrance animation for homepage cards on load, SPA navigation, and when cards re-enter the viewport |
| **Disable Avatar Live Redirect** | Prevent channel avatar clicks on the homepage from sending you into a live stream |

</details>

---

## <img src="docs/icons/languages.svg" width="18" height="18" alt=""> Languages

The extension UI is available in **11 languages** (auto-detected from browser, or pick manually):

`English` `Русский` `Українська` `Español` `Português` `Français` `Deutsch` `Türkçe` `日本語` `한국어` `中文`

---

## <img src="docs/icons/installation.svg" width="18" height="18" alt=""> Installation

### <img src="https://cdn.simpleicons.org/firefoxbrowser/FF7139" width="16" height="16"> Firefox (Firefox, Zen, Waterfox, LibreWolf)

**Recommended:** Install directly from [Mozilla Add-ons (AMO)](https://addons.mozilla.org/firefox/addon/youtube-rewind/) — automatic updates, no config changes needed.

<details>
<summary><b>Manual installation (unsigned)</b></summary>

1. Open `about:config` and accept the warning
2. Search for `xpinstall.signatures.required` and set it to **false**
3. Download the `.xpi` file from [Releases](../../releases) — Firefox will prompt to install it permanently

This works in all Firefox variants (Firefox, Developer Edition, Nightly, ESR, Zen, Waterfox, LibreWolf).

</details>

### <img src="https://cdn.simpleicons.org/googlechrome/4285F4" width="16" height="16"> Chromium (Chrome, Edge, Brave, Opera, Vivaldi, Arc)

Download the `.zip` from [Releases](../../releases).

1. Extract the `.zip` to a folder
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select the extracted folder

The extension stays active across restarts. Chrome may show a warning on startup — just dismiss it.

> The `.crx` file is included for Chromium forks that support self-signed extensions (e.g. ungoogled-chromium).

<details>
<summary><b>Build from source</b></summary>

```bash
git clone https://github.com/crixqq/YouTube-Rewind.git
cd YouTube-Rewind
pnpm install

pnpm build            # Chrome/Chromium
pnpm build:firefox    # Firefox

pnpm zip              # → .output/youtube-rewind-<ver>-chrome.zip
pnpm zip:firefox      # → .output/youtube-rewind-<ver>-firefox.zip
```

#### Chrome — CRX via browser

1. Build the extension: `pnpm build`
2. Go to `chrome://extensions` → enable **Developer mode**
3. Click **Pack extension** → select `.output/chrome-mv3` as the root directory
4. Chrome generates a `.crx` file and a `.pem` private key (keep the key for future updates)

#### Firefox — XPI via web-ext

```bash
pnpm add -D web-ext
npx web-ext build --source-dir .output/firefox-mv2
```

The `.xpi` file will be in the `web-ext-artifacts/` folder. To sign it for permanent installation, use [`web-ext sign`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/#signing-your-extension-for-self-distribution) with your AMO credentials.

</details>

---

## <img src="docs/icons/how_it_works.svg" width="18" height="18" alt=""> How It Works

The extension injects CSS into YouTube and uses `data-*` attributes on `<html>` to toggle styles. Settings are saved to `browser.storage.local` — the content script updates attributes instantly, no reload required.

For things CSS can't handle (like "Explore more topics"), a lightweight MutationObserver tags matching elements so CSS can hide them.

---

## <img src="docs/icons/tech_stack.svg" width="18" height="18" alt=""> Tech Stack

[WXT](https://wxt.dev) &middot; [Svelte 5](https://svelte.dev) &middot; CSS injection via manifest &middot; `browser.storage.local`

---

<p align="center">
  <a href="LICENSE">GPL-3.0</a> &middot; made by <a href="https://github.com/crixqq">crixqq</a>
</p>
