<script lang="ts">
  import { loadSettings, saveSettings } from '@/lib/settings';
  import { t, setLocale } from '@/lib/i18n';

  let logoUrl = $state('');
  let logoRatio = $state(0);
  let dragging = $state(false);
  let loaded = $state(false);

  type Toast = { text: string; type: 'ok' | 'error' };
  let toast = $state<Toast | null>(null);
  let toastTimer = 0;

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

  function processFile(file: File) {
    if (!file) return;
    if (file.size > 512 * 1024) {
      showToast(t('customLogoErrorSize'), 'error');
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast(t('customLogoErrorType'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight;
        if (ratio > 6 || ratio < 0.5) {
          showToast(t('customLogoErrorRatio'), 'error');
          return;
        }
        logoUrl = dataUrl;
        logoRatio = ratio;
        saveSettings({ customLogo: dataUrl, customLogoRatio: ratio });
        showToast(t('customLogoSaved'));
      };
      img.onerror = () => showToast(t('customLogoErrorType'), 'error');
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) processFile(input.files[0]);
    input.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files?.[0]) processFile(e.dataTransfer.files[0]);
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
</script>

{#if loaded}
  <div class="page">
    <h1>YouTube Rewind</h1>
    <p class="subtitle">{t('settingCustomLogo')}</p>

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
        <img src={logoUrl} alt="Logo" class="preview" />
      {:else}
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span class="drop-text">{t('customLogoDrop')}</span>
        <span class="drop-hint">{t('customLogoHint')}</span>
      {/if}
      <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onchange={onFileInput} class="file-input" />
    </label>

    {#if logoUrl}
      <div class="actions">
        <label class="btn btn-change">
          {t('customLogoUpload')}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onchange={onFileInput} class="file-input" />
        </label>
        <button class="btn btn-remove" onclick={removeLogo}>{t('customLogoRemove')}</button>
      </div>
    {/if}

    {#if toast}
      <div class="toast" class:toast-ok={toast.type === 'ok'} class:toast-err={toast.type === 'error'}>
        {toast.text}
      </div>
    {/if}
  </div>
{/if}

<style>
  :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
  :global(body) {
    font-family: 'Google Sans', 'Segoe UI', system-ui, sans-serif;
    background: #0f0d13;
    color: #e6e1e9;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
  }

  .page {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 32px;
    max-width: 420px;
    width: 100%;
  }

  h1 {
    font-size: 20px;
    font-weight: 600;
  }

  .subtitle {
    font-size: 14px;
    color: #938f99;
  }

  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 180px;
    border: 2px dashed #48454e;
    border-radius: 16px;
    padding: 24px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    color: #938f99;
    text-align: center;
  }

  .drop-zone:hover, .drop-zone.dragging {
    border-color: #c8bfff;
    background: rgba(200, 191, 255, 0.06);
  }

  .drop-zone.has-logo {
    border-style: solid;
    border-color: #48454e;
    padding: 16px;
  }

  .drop-zone.has-logo:hover {
    border-color: #c8bfff;
  }

  .drop-text {
    font-size: 14px;
    font-weight: 500;
  }

  .drop-hint {
    font-size: 12px;
    opacity: 0.6;
  }

  .preview {
    max-height: 48px;
    max-width: 280px;
    object-fit: contain;
  }

  .file-input {
    display: none;
  }

  .actions {
    display: flex;
    gap: 10px;
  }

  .btn {
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    padding: 8px 20px;
    border: none;
    border-radius: 9999px;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn:hover { opacity: 0.85; }

  .btn-change {
    background: #433978;
    color: #e5deff;
  }

  .btn-remove {
    background: #48454e;
    color: #e6e1e9;
  }

  .toast {
    font-size: 13px;
    font-weight: 500;
    padding: 8px 20px;
    border-radius: 12px;
    text-align: center;
    animation: slideIn 0.2s ease-out;
  }

  .toast-ok {
    color: #81c784;
    background: rgba(129, 199, 132, 0.12);
  }

  .toast-err {
    color: #ef9a9a;
    background: rgba(239, 154, 154, 0.12);
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
