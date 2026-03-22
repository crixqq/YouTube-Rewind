<p align="center">
  <img src="logo.png" alt="YouTube Rewind" height="64">
  <br><br>
  <b>YouTube Rewind</b>
  <br>
  Clean up YouTube's interface — hide clutter, filter content, customize the look.
  <br><br>
  <a href="https://t.me/ytrewind_extension">Telegram</a> &middot;
  <a href="../../releases">Releases</a> &middot;
  <a href="LICENSE">GPL-3.0</a>
</p>

---

## Features

### Top Bar
| | |
|---|---|
| **Hide Elements** | Hide Create button, voice search, search bar, notifications, and country code from the top bar |

### Watch Page
| | |
|---|---|
| **Classic Player** | Brings back the classic gradient under player controls, removes pill-shaped backgrounds |
| **Disable Description Color** | Removes the adaptive color tint and hover effects from the description area |
| **Wide Content** | Removes width limits — player, metadata, and recommendations fill the full page |

### Homepage
| | |
|---|---|
| **Videos Per Row** | Set how many videos appear per row (1–8), or keep YouTube's default |
| **Content Filter** | Hide Shorts, Posts, Mixes, Breaking News, Latest Posts, and "Explore more topics" |

### Search
| | |
|---|---|
| **Search Filter** | Hide Shorts, Channels, and "People also watched" shelves from search results |

### Sidebar
| | |
|---|---|
| **Sidebar Filter** | Hide Subscriptions, You, Explore, "More from YouTube", Report history, and footer from the left sidebar |

### Appearance
| | |
|---|---|
| **Avatar Shapes** | Change all avatars across YouTube: squircle, rounded square, diamond, hexagon, octagon, clover, or flower |
| **Thumbnail Effects** | Reduce distractions: pixelate, blur, grayscale, or hide video thumbnails everywhere (hover reveal is optional) |
| **Disable Hover Glow** | Remove the ripple/glow animation on thumbnail hover and prevent metadata text color changes |

### Updates
| | |
|---|---|
| **Update Checker** | Click the version badge — the extension checks GitHub for new releases and shows a download button if an update is available |

All settings apply instantly — no page reload needed.

## Languages

The extension UI is available in **11 languages** (auto-detected from browser, or pick manually):

English, Русский, Українська, Español, Português, Français, Deutsch, Türkçe, 日本語, 한국어, 中文

## Installation

Download the extension from [Releases](../../releases):

- **Chromium** (Chrome, Edge, Brave, Opera, Vivaldi, Arc) — `.crx` file
- **Firefox** (Firefox, Zen, Waterfox, LibreWolf) — `.xpi` file

Install it like any other extension file — drag into the browser or open from the extensions page.

<details>
<summary><b>Build from source</b></summary>

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

<details>
<summary><b>Manual packaging (CRX / XPI)</b></summary>

```bash
git clone https://github.com/crixqq/YouTube-Rewind.git
cd YouTube-Rewind
pnpm install

pnpm build            # Chrome/Chromium
pnpm build:firefox    # Firefox

pnpm zip              # → .output/youtube-rewind-<ver>-chrome.zip
pnpm zip:firefox      # → .output/youtube-rewind-<ver>-firefox.zip
```

</details>

## How it works

The extension injects CSS into YouTube and uses `data-*` attributes on `<html>` to toggle styles. Settings are saved to `browser.storage.local` — the content script updates attributes instantly, no reload required.

For things CSS can't handle (like "Explore more topics"), a lightweight MutationObserver tags matching elements so CSS can hide them.

## Tech Stack

[WXT](https://wxt.dev) &middot; [Svelte 5](https://svelte.dev) &middot; CSS injection via manifest &middot; `browser.storage.local`

## License

[GNU General Public License v3.0](LICENSE)
