<p align="center">
  <img src="icon.png" alt="YouTube Rewind" width="128" height="128">
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
| **Hide Elements** | Hide Create button, voice search, notifications, and country code from the top bar |
| **Custom Logo** | Replace the YouTube logo with your own image — auto-sized to fit |

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
| **Thumbnail Effects** | Reduce distractions: pixelate, blur, grayscale, or hide video thumbnails (hover to reveal) |

### Updates
| | |
|---|---|
| **Update Checker** | Click the version badge — the extension checks GitHub for new releases and shows a download button if an update is available |

All settings apply instantly — no page reload needed.

## Languages

The extension UI is available in **11 languages** (auto-detected from browser, or pick manually):

English, Русский, Українська, Español, Português, Français, Deutsch, Türkçe, 日本語, 한국어, 中文

## Installation

### Chrome / Edge / Brave / Opera / Vivaldi / Arc

1. Download `youtube-rewind-0.1.0-chrome.zip` from [Releases](../../releases)
2. Unzip to any folder
3. Go to `chrome://extensions` and enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the unzipped folder
5. Done — the icon appears in your toolbar

> The browser shows a "developer mode" warning on startup. This is normal. Publishing to the Chrome Web Store removes it.

### Firefox

1. Download `youtube-rewind-0.1.0-firefox.zip` from [Releases](../../releases)
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and select the ZIP file
4. The extension works until Firefox restarts

> For permanent Firefox installation, publish to [Firefox Add-ons](https://addons.mozilla.org/developers/) or use Firefox ESR with `xpinstall.signatures.required` set to `false`.

### Build from source

```bash
git clone https://github.com/crixqq/YouTube-Rewind.git
cd YouTube-Rewind
pnpm install

pnpm build            # Chrome/Chromium
pnpm build:firefox    # Firefox

pnpm zip              # → .output/youtube-rewind-<ver>-chrome.zip
pnpm zip:firefox      # → .output/youtube-rewind-<ver>-firefox.zip
```

## How it works

The extension injects CSS into YouTube and uses `data-*` attributes on `<html>` to toggle styles. Settings are saved to `browser.storage.local` — the content script updates attributes instantly, no reload required.

For things CSS can't handle (like "Explore more topics"), a lightweight MutationObserver tags matching elements so CSS can hide them.

## Tech Stack

[WXT](https://wxt.dev) &middot; [Svelte 5](https://svelte.dev) &middot; CSS injection via manifest &middot; `browser.storage.local`

## License

[GNU General Public License v3.0](LICENSE)
