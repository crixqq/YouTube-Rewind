<script lang="ts">
  import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/lib/settings';
  import { t, setLocale } from '@/lib/i18n';

  let loaded = $state(false);
  let dragging = $state(false);

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
      loaded = true;
    });
  });

  function parseSettings(text: string): Partial<Settings> | null {
    try {
      const obj = JSON.parse(text);
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) return obj;
    } catch {}
    try {
      const lines = text.split('\n').filter((l) => l.includes('='));
      if (lines.length === 0) return null;
      const result: Record<string, unknown> = {};
      for (const line of lines) {
        const [key, ...rest] = line.split('=');
        const k = key.trim();
        const v = rest.join('=').trim();
        if (v === 'true') result[k] = true;
        else if (v === 'false') result[k] = false;
        else if (!isNaN(Number(v)) && v !== '') result[k] = Number(v);
        else result[k] = v;
      }
      return result as Partial<Settings>;
    } catch {}
    return null;
  }

  async function applyImport(text: string) {
    const parsed = parseSettings(text);
    if (!parsed) {
      showToast(t('importError'), 'error');
      return;
    }
    const known = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
    const filtered: Partial<Settings> = {};
    for (const key of known) {
      if (key in parsed) (filtered as any)[key] = (parsed as any)[key];
    }
    await saveSettings(filtered);
    showToast(t('importSuccess'));
  }

  async function processFile(file: File) {
    if (!file) return;
    const text = await file.text();
    await applyImport(text);
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
</script>

{#if loaded}
  <div class="page">
    <h1>YouTube Rewind</h1>
    <p class="subtitle">{t('importSettings')}</p>

    <div class="card">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <label
        class="drop-zone"
        class:dragging
        ondrop={onDrop}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
      >
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <polyline points="9 15 12 12 15 15"/>
        </svg>
        <span class="drop-text">{t('importDrop')}</span>
        <span class="drop-hint">{t('importHint')}</span>
        <input type="file" accept=".json,.txt" onchange={onFileInput} class="file-input" />
      </label>
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
    --md-primary-container: #e5deff;
    --md-on-primary-container: #170065;
    --md-surface: #fdf8ff;
    --md-surface-container: #f1ecf4;
    --md-surface-container-high: #ece7ef;
    --md-on-surface: #1c1b20;
    --md-on-surface-variant: #48454e;
    --md-outline-variant: #c9c5d0;
    --md-error: #ba1a1a;
    --md-shape-sm: 8px;
    --md-shape-lg: 16px;
    font-family: 'Google Sans', 'Segoe UI', system-ui, sans-serif;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --md-primary: #c8bfff;
      --md-primary-container: #433978;
      --md-on-primary-container: #e5deff;
      --md-surface: #141318;
      --md-surface-container: #201f25;
      --md-surface-container-high: #2b292f;
      --md-on-surface: #e6e1e9;
      --md-on-surface-variant: #c9c5d0;
      --md-outline-variant: #48454e;
      --md-error: #ffb4ab;
    }
  }

  :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
  :global(body) {
    background: var(--md-surface);
    color: var(--md-on-surface);
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
    color: var(--md-on-surface-variant);
  }

  .card {
    width: 100%;
    background: var(--md-surface-container);
    border-radius: var(--md-shape-lg);
    padding: 8px;
  }

  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 160px;
    border: 2px dashed var(--md-outline-variant);
    border-radius: var(--md-shape-sm);
    padding: 24px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    color: var(--md-on-surface-variant);
    text-align: center;
  }

  .drop-zone:hover, .drop-zone.dragging {
    border-color: var(--md-primary);
    background: var(--md-surface-container-high);
  }

  .drop-text {
    font-size: 14px;
    font-weight: 500;
  }

  .drop-hint {
    font-size: 12px;
    opacity: 0.6;
  }

  .file-input {
    display: none;
  }

  .toast {
    font-size: 13px;
    font-weight: 500;
    padding: 10px 20px;
    border-radius: var(--md-shape-sm);
    text-align: center;
    animation: slideIn 0.2s ease-out;
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
</style>
