# Privacy Policy for YouTube Rewind

Effective date: 2026-05-22

YouTube Rewind is a browser extension that customizes the YouTube interface, adds local viewing tools, and stores user preferences on the user's device.

## Summary

YouTube Rewind does not sell user data and does not transfer user data to data brokers, advertising platforms, or other information resellers.

YouTube Rewind uses any handled data only to provide its user-facing features and to operate the extension locally in the browser. The extension is intended to comply with the Chrome Web Store User Data Policy, including the Limited Use requirements.

Video Sense AI is optional and is disabled by default. If the user enables it and sends a message, the extension may send the current video context and the user's prompt to the AI provider selected by the user. The developer does not operate an AI proxy server and does not receive those prompts.

## What data the extension handles

### 1. Settings and local configuration

The extension stores settings locally in the browser, including:

- interface preferences
- language selection
- profiles and imported/exported configuration data
- custom logo data chosen by the user
- watch timer and daily limit state

This data is stored locally using browser extension storage and is not sent to the developer.

### 2. Website content and resources

The extension handles limited YouTube page content and related resources in order to provide its features. This includes, for example:

- reading the current YouTube page state and page structure so the extension can hide or restyle interface elements
- working with thumbnail images for preview, copy, and download features
- capturing or generating screenshot and preview images when the user explicitly uses those features

This processing happens locally in the browser.

### 3. Optional AI assistant data

If the user enables Video Sense AI and submits a question, the extension may prepare and send the following data to the selected AI provider:

- the user's question and recent assistant conversation messages
- current YouTube video title, channel name, URL, description text, visible comments, and visible page context
- description links or related YouTube links selected for source checking
- transcript or page summary text when available and when the related assistant options are enabled
- web-search snippets when web context is enabled

This data is sent only to complete the AI request initiated by the user. The selected provider may be OpenRouter, OpenAI, Anthropic/Claude, Perplexity, or another compatible endpoint configured by the user. The extension stores API keys locally in browser extension storage and sends the active key only to the selected provider endpoint for the user's request.

AI answers can be inaccurate. The extension shows an in-product notice that video context and user prompts may be sent to the selected provider.

### 4. Web browsing activity related to YouTube

The extension reads the current YouTube page URL and page context only as needed to provide user-facing features, such as:

- detecting whether the current page is a watch page, home page, search page, or channel page
- identifying the current video ID
- applying watch-page tools such as screenshot capture, thumbnail actions, default speed, and default quality

The extension does not build a remote browsing history database and does not send browsing activity to the developer.

### 5. User activity needed for local features

If the user enables watch timer features, the extension stores local aggregate viewing-time data so it can show daily watch time and optional daily limits.

This data remains local to the browser unless the user manually exports settings or profiles.

### 6. Clipboard data used on direct user action

The extension may read from or write to the clipboard only after a direct user action. Examples include:

- importing settings from pasted text
- pasting a custom logo image from the clipboard
- copying exported settings
- copying thumbnail links
- copying screenshot or preview images

Clipboard contents are used only to complete the action requested by the user.

## What data the extension does not collect

YouTube Rewind is not designed to collect:

- personally identifiable information such as name, address, email address, or phone number
- health information
- financial or payment information
- authentication credentials such as passwords or PINs, except user-provided AI API keys that are stored locally and used only for the selected provider request
- personal communications
- location data

## Sharing and transfers

YouTube Rewind does not sell or transfer user data to third parties for advertising, profiling, data brokerage, or creditworthiness decisions.

Limited network requests may occur for the following user-facing purposes:

- to load YouTube thumbnail images from YouTube image hosts
- to check public release metadata from GitHub Releases or Firefox Add-ons for the update status shown in the extension UI
- to send optional Video Sense AI requests to the user-selected AI provider when the user enables the assistant and submits a prompt
- to fetch public web or YouTube context when the assistant's web/source inspection options are enabled
- to open external pages the user explicitly chooses to open, such as support links or the optional third-party video download page

These requests are limited to the feature the user is using at that moment.

For AI providers and external websites, data handling is also governed by that provider's own terms and privacy policy.

## Data retention

Locally stored extension data remains in the browser until:

- the user changes or resets the settings
- the user removes custom data such as uploaded logo media
- the user uninstalls the extension

## Security

The extension is designed to keep handled data local whenever possible. The developer does not operate a backend that receives user settings, screenshots, viewing history, or uploaded logos from the extension.

## User choices

Users can:

- change or reset settings inside the extension
- remove custom logos and other locally stored extension data
- uninstall the extension at any time

## Contact

Project page:

- `https://github.com/crixqq/YouTube-Rewind`

Support page:

- `https://github.com/crixqq/YouTube-Rewind/issues`
