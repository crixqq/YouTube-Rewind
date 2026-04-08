<script lang="ts">
  import { loadSettings, saveSettings } from '@/lib/settings';
  import { t, setLocale } from '@/lib/i18n';

  const MAX_LOGO_FILE_SIZE = 2 * 1024 * 1024;
  const LOGO_ACCEPT = 'image/png,image/jpeg,image/gif,image/svg+xml,image/webp,video/mp4,video/webm,video/ogg';

  let logoUrl = $state('');
  let logoRatio = $state(0);
  let dragging = $state(false);
  let pasting = $state(false);
  let loaded = $state(false);

  type Toast = { text: string; type: 'ok' | 'error' };
  let toast = $state<Toast | null>(null);
  let toastTimer = 0;

  function isVideoLogo(src: string): boolean {
    return /^data:video\//i.test(src) || /\.(mp4|webm|ogg|mov)(?:$|[?#])/i.test(src);
  }

  function showToast(text: string, type: Toast['type'] = 'ok') {
    clearTimeout(toastTimer);
    toast = { text, type };
    toastTimer = window.setTimeout(() => { toast = null; }, 2500);
  }

  $effect(() => {
    loadSettings().then((s) => {
      setLocale(s.language);
      logoUrl = s.customLogo;
      logoRatio = s.customLogoRatio;
      loaded = true;
    });
  });

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read_failed'));
      reader.readAsDataURL(file);
    });
  }

  function validateRatio(width: number, height: number): number {
    const ratio = width / height;
    if (ratio > 6 || ratio < 0.5) {
      throw new Error('ratio_invalid');
    }
    return ratio;
  }

  function loadImageRatio(dataUrl: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          resolve(validateRatio(img.naturalWidth, img.naturalHeight));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('type_invalid'));
      img.src = dataUrl;
    });
  }

  function loadVideoRatio(dataUrl: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        try {
          resolve(validateRatio(video.videoWidth, video.videoHeight));
        } catch (error) {
          reject(error);
        }
      };
      video.onerror = () => reject(new Error('type_invalid'));
      video.src = dataUrl;
      video.load();
    });
  }

  async function processFile(file: File) {
    if (!file) return;
    if (file.size > MAX_LOGO_FILE_SIZE) {
      showToast(t('customLogoErrorSize'), 'error');
      return;
    }

    const fileType = file.type.toLowerCase();
    const isImage = fileType.startsWith('image/');
    const isVideo = fileType.startsWith('video/');

    if (!isImage && !isVideo) {
      showToast(t('customLogoErrorType'), 'error');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const ratio = isVideo ? await loadVideoRatio(dataUrl) : await loadImageRatio(dataUrl);
      logoUrl = dataUrl;
      logoRatio = ratio;
      await saveSettings({ customLogo: dataUrl, customLogoRatio: ratio });
      showToast(t('customLogoSaved'));
    } catch (error) {
      if (error instanceof Error && error.message === 'ratio_invalid') {
          showToast(t('customLogoErrorRatio'), 'error');
      } else {
        showToast(t('customLogoErrorType'), 'error');
      }
    }
  }

  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) void processFile(input.files[0]);
    input.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files?.[0]) void processFile(e.dataTransfer.files[0]);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }

  function onDragLeave() {
    dragging = false;
  }

  function removeLogo() {
    logoUrl = '';
    logoRatio = 0;
    saveSettings({ customLogo: '', customLogoRatio: 0 });
    showToast(t('customLogoRemoved'));
  }

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.read) {
      showToast(t('pasteImageError'), 'error');
      return;
    }

    try {
      pasting = true;
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const mediaType = item.types.find((type) => type.startsWith('image/') || type.startsWith('video/'));
        if (!mediaType) continue;
        const blob = await item.getType(mediaType);
        const ext = mediaType.split('/')[1]?.replace('jpeg', 'jpg') || (mediaType.startsWith('video/') ? 'webm' : 'png');
        await processFile(new File([blob], `clipboard-logo.${ext}`, { type: mediaType }));
        return;
      }
      showToast(t('pasteImageEmpty'), 'error');
    } catch {
      showToast(t('pasteImageError'), 'error');
    } finally {
      pasting = false;
    }
  }
</script>

{#if loaded}
  <div class="page">
    <h1>YouTube Rewind</h1>
    <p class="subtitle">{t('settingCustomLogo')}</p>

    <div class="card">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <label
        class="drop-zone"
        class:dragging
        class:has-logo={!!logoUrl}
        ondrop={onDrop}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
      >
        {#if logoUrl}
          {#if isVideoLogo(logoUrl)}
            <video src={logoUrl} class="preview" muted autoplay loop playsinline></video>
          {:else}
            <img src={logoUrl} alt="Logo" class="preview" />
          {/if}
        {:else}
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span class="drop-text">{t('customLogoDrop')}</span>
          <span class="drop-hint">{t('customLogoHint')}</span>
        {/if}
        <input type="file" accept={LOGO_ACCEPT} onchange={onFileInput} class="file-input" />
      </label>

      <div class="actions" class:actions-single={!logoUrl}>
        {#if logoUrl}
          <label class="btn btn-tonal">
            {t('customLogoUpload')}
            <input type="file" accept={LOGO_ACCEPT} onchange={onFileInput} class="file-input" />
          </label>
        {/if}
        <button class="btn btn-ghost" class:is-loading={pasting} onclick={() => void pasteFromClipboard()}>
          {t('pasteClipboard')}
        </button>
        {#if logoUrl}
          <button class="btn btn-outline" onclick={removeLogo}>{t('customLogoRemove')}</button>
        {/if}
      </div>
    </div>

    {#if toast}
      <div class="toast" class:toast-ok={toast.type === 'ok'} class:toast-err={toast.type === 'error'}>
        {toast.text}
      </div>
    {/if}
  </div>
{/if}

<style>
  :root {
    --md-primary: #5b5091;
    --md-on-primary: #ffffff;
    --md-primary-container: #e5deff;
    --md-on-primary-container: #170065;
    --md-secondary-container: #e4dff9;
    --md-on-secondary-container: #1b1a2c;
    --md-surface: #fdf8ff;
    --md-surface-container: #f1ecf4;
    --md-surface-container-high: #ece7ef;
    --md-on-surface: #1c1b20;
    --md-on-surface-variant: #48454e;
    --md-outline: #79767f;
    --md-outline-variant: #c9c5d0;
    --md-error: #ba1a1a;
    --md-shape-sm: 8px;
    --md-shape-md: 12px;
    --md-shape-lg: 16px;
    --md-shape-xl: 28px;
    font-family: 'Google Sans', 'Segoe UI', system-ui, sans-serif;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --md-primary: #c8bfff;
      --md-on-primary: #2c2060;
      --md-primary-container: #433978;
      --md-on-primary-container: #e5deff;
      --md-secondary-container: #474459;
      --md-on-secondary-container: #e4dff9;
      --md-surface: #141318;
      --md-surface-container: #201f25;
      --md-surface-container-high: #2b292f;
      --md-on-surface: #e6e1e9;
      --md-on-surface-variant: #c9c5d0;
      --md-outline: #938f99;
      --md-outline-variant: #48454e;
      --md-error: #ffb4ab;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(*),
    :global(*::before),
    :global(*::after) {
      animation-duration: 0s !important;
      transition-duration: 0s !important;
    }
  }

  :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
  :global(body) {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--md-surface) 94%, #17131f 6%), var(--md-surface)),
      linear-gradient(120deg, color-mix(in srgb, var(--md-primary-container) 18%, transparent), transparent 42%);
    color: var(--md-on-surface);
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--md-primary) transparent;
    scrollbar-gutter: stable both-edges;
  }

  :global(body::-webkit-scrollbar) {
    width: 10px;
  }

  :global(body::-webkit-scrollbar-track) {
    background: rgba(0, 0, 0, 0.04);
  }

  :global(body::-webkit-scrollbar-thumb) {
    border-radius: 999px;
    border: 2px solid transparent;
    background:
      repeating-linear-gradient(
        180deg,
        rgba(200, 191, 255, 0.92) 0 10px,
        rgba(91, 80, 145, 0.82) 10px 22px,
        rgba(220, 214, 255, 0.94) 22px 34px
      );
    background-size: 100% 180%;
    background-position: 50% 0%;
    background-clip: padding-box;
    animation: scrollbarWave 4.8s linear infinite;
    will-change: background-position;
  }

  :global(body::-webkit-scrollbar-thumb:hover) {
    animation-duration: 3.2s;
  }

  :global(body::-webkit-scrollbar-thumb:active) {
    animation-duration: 2.2s;
  }

  .page {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    padding: 40px 32px;
    max-width: 420px;
    width: 100%;
    animation: pageEnter 0.48s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .page::before,
  .page::after {
    content: none;
  }

  h1 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .subtitle {
    font-size: 14px;
    color: var(--md-on-surface-variant);
    text-align: center;
    max-width: 320px;
    line-height: 1.45;
  }

  .card {
    position: relative;
    width: 100%;
    overflow: hidden;
    background: color-mix(in srgb, var(--md-surface-container) 86%, transparent);
    border: 1px solid color-mix(in srgb, var(--md-outline-variant) 72%, transparent);
    border-radius: 24px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: cardEnter 0.56s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .drop-zone {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    min-height: 188px;
    border: 1px solid color-mix(in srgb, var(--md-outline-variant) 78%, transparent);
    border-radius: 20px;
    padding: 28px 24px;
    cursor: pointer;
    transition:
      border-color 0.24s ease,
      background 0.24s ease;
    color: var(--md-on-surface-variant);
    text-align: center;
    background: color-mix(in srgb, var(--md-surface) 92%, transparent);
  }

  .drop-zone::before,
  .drop-zone::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .drop-zone::before {
    background: linear-gradient(120deg, transparent 20%, rgba(255, 255, 255, 0.18), transparent 78%);
    transform: translateX(-140%);
    animation: dropSweep 5s ease-in-out infinite;
  }

  .drop-zone::after {
    content: none;
  }

  .drop-zone > * {
    position: relative;
    z-index: 1;
  }

  .drop-zone:hover, .drop-zone.dragging {
    border-color: var(--md-primary);
    background: color-mix(in srgb, var(--md-surface-container-high) 90%, transparent);
  }

  .drop-zone.has-logo {
    border-style: solid;
    border-color: color-mix(in srgb, var(--md-outline-variant) 88%, transparent);
    min-height: auto;
    padding: 18px 20px;
  }

  .drop-zone.has-logo:hover {
    border-color: var(--md-primary);
  }

  .drop-zone svg {
    color: var(--md-primary);
  }

  .drop-text {
    font-size: 15px;
    font-weight: 600;
    color: var(--md-on-surface);
  }

  .drop-hint {
    font-size: 12px;
    opacity: 0.72;
    line-height: 1.4;
  }

  .preview {
    max-height: 54px;
    max-width: 280px;
    object-fit: contain;
  }

  .file-input {
    display: none;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
    padding: 2px 2px 6px;
  }

  .actions.actions-single {
    padding-top: 2px;
  }

  .btn {
    min-height: 42px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 600;
    padding: 8px 20px;
    border: 1px solid transparent;
    border-radius: 999px;
    cursor: pointer;
    transition:
      opacity 0.18s ease,
      background 0.18s ease,
      border-color 0.18s ease,
      transform 0.18s ease;
  }

  .btn:hover {
    opacity: 0.94;
    transform: scale(1.03);
  }
  .btn:active { transform: scale(0.95); }

  .btn-tonal {
    background: var(--md-primary-container);
    color: var(--md-on-primary-container);
    border-color: color-mix(in srgb, var(--md-primary) 28%, transparent);
  }

  .btn-outline {
    background: transparent;
    color: var(--md-on-surface-variant);
    border: 1px solid var(--md-outline-variant);
  }

  .btn-ghost {
    background: color-mix(in srgb, var(--md-surface-container-high) 88%, transparent);
    color: var(--md-on-surface);
    border-color: color-mix(in srgb, var(--md-outline-variant) 80%, transparent);
  }

  .btn-outline:hover {
    background: var(--md-surface-container-high);
  }

  .btn-ghost:hover {
    background: color-mix(in srgb, var(--md-surface-container-high) 92%, transparent);
    border-color: color-mix(in srgb, var(--md-outline) 74%, transparent);
  }

  .btn.is-loading {
    opacity: 0.72;
    pointer-events: none;
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    font-size: 13px;
    font-weight: 500;
    padding: 10px 20px;
    border-radius: 999px;
    text-align: center;
    animation: slideIn 0.2s ease-out;
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  .toast-ok {
    color: #2e7d32;
    background: #e8f5e9;
  }

  .toast-err {
    color: var(--md-error);
    background: rgba(186, 26, 26, 0.08);
  }

  @media (prefers-color-scheme: dark) {
    .toast-ok {
      color: #81c784;
      background: rgba(129, 199, 132, 0.12);
    }
    .toast-err {
      background: rgba(255, 180, 171, 0.12);
    }
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes scrollbarWave {
    from { background-position: 50% 0%; }
    to { background-position: 50% 180%; }
  }

  @keyframes pageEnter {
    from { opacity: 0; transform: translateY(18px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes cardEnter {
    from { opacity: 0; transform: translateY(24px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes dropSweep {
    0%, 18% { transform: translateX(-140%); }
    42%, 100% { transform: translateX(140%); }
  }

</style>
