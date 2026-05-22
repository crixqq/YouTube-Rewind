# YouTube Rewind Features

This file lists the current feature set for YouTube Rewind 0.6.0.

## Profiles

- Built-in profiles: Default, Focus, Minimal, Clean.
- Custom profiles with import, export, rename, delete, and save current settings.
- Profile changes stay editable without silently switching presets to Custom.

## Homepage

- Videos per row from 1 to 8, or YouTube default.
- Optional adaptive grid: the chosen count is treated as the Full HD target, then reduced on smaller screens to keep card sizes close to the intended size.
- Hide Shorts, Posts, Mixes, Breaking News, Latest Posts, Playables, Explore topics, New badges, and filter chips.

## Watch Page

- Hide Join, Subscribe, Like/Dislike, Share, Download, Clip/Remix, Thanks, Save, and Ask buttons.
- Download thumbnail control with preview, copy, copy link, and download actions.
- Frame screenshot tools with preview, annotation, copy, and download.
- Wide player, classic player styling, classic like/dislike icons, and description color controls.
- Default playback speed with current-page manual override.
- Ctrl + wheel speed adjustment with a YouTube-style overlay.
- Auto-skip YouTube's own Skip Ads button.

## Search And Sidebar

- Hide Shorts, Channels, and People also watched from search.
- Hide Subscriptions, You, Explore, More from YouTube, Report history, and sidebar footer.

## Appearance

- Thumbnail effects: none, pixelate, blur, grayscale, hidden.
- Thumbnail and avatar shapes including sharp, rounded, squircle, notched, slanted, arch, diamond, hexagon, octagon, clover, and flower.
- YouTube logo options: native YouTube, built-in YouTube Rewind, or uploaded image/GIF/video.
- Per-logo size controls and optional hiding of YouTube event logos.
- Settings theme mode, palette presets, and custom accent color.

## Channel Tools

- Channel avatar and banner preview/download.
- Channel and video stats shortcuts for services such as Social Blade, vidIQ, ViewStats, Playboard, and NoxInfluencer where supported.

## Watch Timer

- Daily watch timer overlay.
- Optional daily limit and repeat blocking behavior.

## Video Sense AI

- Optional assistant for the current YouTube video.
- Supports OpenRouter, OpenAI, Anthropic/Claude, and Perplexity provider settings.
- Provider-specific API keys are stored locally in browser extension storage.
- Model presets, custom OpenRouter model IDs, response language, style, temperature, answer length, web snippets, source-link inspection, and channel context controls.
- Optional experimental YouTube/Gemini summary use. It only reads a summary already visible on the page; direct Gemini chat is not used.
- AI privacy notice: video context, user prompts, and selected links may be sent to the selected AI provider. AI answers can be inaccurate.

## Beta And Developer

- Beta controls for homepage animations, stable description colors, frame screenshots, instant screenshot downloads, and experimental assistant context options.
- Developer tools for diagnostics, logs, cache/reset maintenance, import/export, and reload actions.

## Languages

The settings UI supports English, Russian, Ukrainian, Spanish, Portuguese, French, German, Turkish, Italian, Polish, Dutch, Japanese, Korean, and Chinese, with English fallback for any missing text.
