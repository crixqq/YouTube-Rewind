<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';

  export let label = '';
  export let value = '#c8bfff';
  export let presets: string[] = [];
  export let onchange: (value: string) => void = () => {};
  export let floating = false;

  type RgbColor = { r: number; g: number; b: number };
  type HsvColor = { h: number; s: number; v: number };
  type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

  const DEFAULT_COLOR = '#c8bfff';

  let rootEl: HTMLDivElement | null = null;
  let triggerEl: HTMLButtonElement | null = null;
  let planeEl: HTMLDivElement | null = null;
  let panelEl: HTMLDivElement | null = null;
  let panelOpen = false;
  let canUseEyedropper = false;
  let hexDraft = DEFAULT_COLOR.toUpperCase();
  let hexFocused = false;
  let hue = 248;
  let saturation = 0.25;
  let brightness = 1;
  let lastSyncedHex = DEFAULT_COLOR;
  let currentHueColor = DEFAULT_COLOR;
  let floatingPanelStyle = '';

  function clamp(number: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, number));
  }

  function clamp01(number: number): number {
    return Math.min(1, Math.max(0, number));
  }

  function clampHue(number: number): number {
    return Math.min(360, Math.max(0, Math.round(number)));
  }

  function normalizeHexColor(input: string, fallback = DEFAULT_COLOR): string {
    const normalized = input.trim().toLowerCase();
    return /^#([0-9a-f]{6})$/i.test(normalized) ? normalized : fallback;
  }

  function hexToRgb(hex: string): RgbColor | null {
    const normalized = normalizeHexColor(hex, '');
    if (!normalized) return null;
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
    };
  }

  function rgbToHex({ r, g, b }: RgbColor): string {
    return `#${[r, g, b]
      .map((channel) => Math.min(255, Math.max(0, Math.round(channel))).toString(16).padStart(2, '0'))
      .join('')}`;
  }

  function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
    const red = clamp01(r / 255);
    const green = clamp01(g / 255);
    const blue = clamp01(b / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let nextHue = 0;

    if (delta !== 0) {
      if (max === red) nextHue = ((green - blue) / delta) % 6;
      else if (max === green) nextHue = (blue - red) / delta + 2;
      else nextHue = (red - green) / delta + 4;
    }

    return {
      h: ((nextHue * 60) + 360) % 360,
      s: max === 0 ? 0 : delta / max,
      v: max,
    };
  }

  function hsvToRgb(color: HsvColor): RgbColor {
    const nextHue = (((color.h % 360) + 360) % 360) / 60;
    const chroma = clamp01(color.v) * clamp01(color.s);
    const x = chroma * (1 - Math.abs((nextHue % 2) - 1));
    const m = clamp01(color.v) - chroma;

    let red = 0;
    let green = 0;
    let blue = 0;

    if (nextHue >= 0 && nextHue < 1) [red, green, blue] = [chroma, x, 0];
    else if (nextHue < 2) [red, green, blue] = [x, chroma, 0];
    else if (nextHue < 3) [red, green, blue] = [0, chroma, x];
    else if (nextHue < 4) [red, green, blue] = [0, x, chroma];
    else if (nextHue < 5) [red, green, blue] = [x, 0, chroma];
    else [red, green, blue] = [chroma, 0, x];

    return {
      r: Math.round((red + m) * 255),
      g: Math.round((green + m) * 255),
      b: Math.round((blue + m) * 255),
    };
  }

  function syncFromHex(nextHex: string): void {
    const rgb = hexToRgb(nextHex) || hexToRgb(DEFAULT_COLOR)!;
    const hsv = rgbToHsv(rgb);
    hue = hsv.h;
    saturation = hsv.s;
    brightness = hsv.v;
    if (!hexFocused) {
      hexDraft = nextHex.toUpperCase();
    }
  }

  function dispatchColor(nextHex: string): void {
    const normalized = normalizeHexColor(nextHex, lastSyncedHex);
    hexDraft = normalized.toUpperCase();
    if (normalized !== lastSyncedHex) {
      onchange(normalized);
    }
  }

  function commitHexDraft(): void {
    hexFocused = false;
    dispatchColor(hexDraft);
  }

  function updateFromPlane(clientX: number, clientY: number): void {
    if (!planeEl) return;
    const rect = planeEl.getBoundingClientRect();
    saturation = clamp01((clientX - rect.left) / rect.width);
    brightness = 1 - clamp01((clientY - rect.top) / rect.height);
    dispatchColor(rgbToHex(hsvToRgb({ h: hue, s: saturation, v: brightness })));
  }

  function handlePlanePointerDown(event: PointerEvent): void {
    updateFromPlane(event.clientX, event.clientY);
    const handlePointerMove = (moveEvent: PointerEvent) => updateFromPlane(moveEvent.clientX, moveEvent.clientY);
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function handleHueInput(event: Event): void {
    hue = clampHue(Number((event.currentTarget as HTMLInputElement).value));
    dispatchColor(rgbToHex(hsvToRgb({ h: hue, s: saturation, v: brightness })));
  }

  async function pickWithEyedropper(): Promise<void> {
    const EyeDropperClass = (window as Window & { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!EyeDropperClass) return;
    try {
      const eyedropper = new EyeDropperClass();
      const result = await eyedropper.open();
      panelOpen = true;
      dispatchColor(result.sRGBHex);
    } catch {}
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (!panelOpen || !rootEl) return;
    if (!rootEl.contains(event.target as Node)) {
      panelOpen = false;
    }
  }

  function updateFloatingPanelPosition(): void {
    if (!floating || !panelOpen || !triggerEl || !panelEl) {
      floatingPanelStyle = '';
      return;
    }

    const margin = 12;
    const gap = 8;
    const triggerRect = triggerEl.getBoundingClientRect();
    const panelWidth = clamp(Math.max(triggerRect.width, 320), 280, window.innerWidth - margin * 2);

    panelEl.style.width = `${Math.round(panelWidth)}px`;
    const panelRect = panelEl.getBoundingClientRect();
    const panelHeight = panelRect.height || 420;
    const spaceBelow = window.innerHeight - triggerRect.bottom - margin;
    const spaceAbove = triggerRect.top - margin;
    const openAbove = spaceBelow < panelHeight + gap && spaceAbove > spaceBelow;
    const left = clamp(triggerRect.left, margin, window.innerWidth - margin - panelWidth);
    const top = openAbove
      ? clamp(triggerRect.top - gap - panelHeight, margin, window.innerHeight - margin - panelHeight)
      : clamp(triggerRect.bottom + gap, margin, window.innerHeight - margin - panelHeight);

    floatingPanelStyle = `left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(panelWidth)}px;`;
  }

  async function syncFloatingPanelPosition(): Promise<void> {
    if (!panelOpen || !floating) {
      floatingPanelStyle = '';
      return;
    }

    await tick();
    updateFloatingPanelPosition();
  }

  function handleViewportChange(): void {
    void syncFloatingPanelPosition();
  }

  function togglePanel(): void {
    panelOpen = !panelOpen;
    if (panelOpen) {
      void syncFloatingPanelPosition();
    }
  }

  onMount(() => {
    const EyeDropperClass = (window as Window & { EyeDropper?: EyeDropperCtor }).EyeDropper;
    canUseEyedropper = typeof EyeDropperClass === 'function';
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
  });

  onDestroy(() => {
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('scroll', handleViewportChange, true);
  });

  $: {
    const normalizedValue = normalizeHexColor(value, DEFAULT_COLOR);
    if (normalizedValue !== lastSyncedHex) {
      lastSyncedHex = normalizedValue;
      syncFromHex(normalizedValue);
    }
  }

  $: currentHueColor = rgbToHex(hsvToRgb({ h: hue, s: 1, v: 1 }));
  $: if (panelOpen && floating) {
    void syncFloatingPanelPosition();
  }
</script>

<div class="color-picker" bind:this={rootEl}>
  {#if label}
    <div class="color-picker-label">{label}</div>
  {/if}

  <div class="color-picker-row">
    <button
      type="button"
      class="color-picker-trigger"
      bind:this={triggerEl}
      aria-label={label}
      aria-expanded={panelOpen}
      onclick={togglePanel}
    >
      <span class="color-picker-trigger-swatch" style={`background:${lastSyncedHex}`}></span>
      <span class="color-picker-trigger-value">{lastSyncedHex.toUpperCase()}</span>
      <svg class="color-picker-trigger-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="m7 10 5 5 5-5"/>
      </svg>
    </button>

    <input
      class="color-picker-hex-input"
      type="text"
      inputmode="text"
      placeholder="#C8BFFF"
      bind:value={hexDraft}
      aria-label={`${label} hex`}
      onfocus={() => { hexFocused = true; }}
      onblur={commitHexDraft}
      onkeydown={(event) => {
        if (event.key === 'Enter') commitHexDraft();
        if (event.key === 'Escape') {
          hexFocused = false;
          hexDraft = lastSyncedHex.toUpperCase();
        }
      }}
    />
  </div>

  {#if panelOpen}
    <div
      class="color-picker-panel"
      class:color-picker-panel-floating={floating}
      bind:this={panelEl}
      style={floating ? floatingPanelStyle : undefined}
    >
      <div
        class="color-picker-plane"
        bind:this={planeEl}
        role="presentation"
        style={`background:
          linear-gradient(to top, #000, transparent),
          linear-gradient(to right, #fff, ${currentHueColor})`}
        onpointerdown={handlePlanePointerDown}
      >
        <div
          class="color-picker-handle"
          style={`left:${(saturation * 100).toFixed(2)}%;top:${((1 - brightness) * 100).toFixed(2)}%;`}
        ></div>
      </div>

      <div class="color-picker-controls">
        <div class="color-picker-hue-wrap">
          <svg class="color-picker-hue-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v18"/>
            <path d="M5.5 8.5h13"/>
            <path d="M7.5 15.5h9"/>
          </svg>
          <input
            class="color-picker-hue-slider"
            type="range"
            min="0"
            max="360"
            value={Math.round(hue)}
            oninput={handleHueInput}
            aria-label="Hue"
          />
        </div>

        {#if canUseEyedropper}
          <button type="button" class="color-picker-eye" onclick={() => void pickWithEyedropper()} aria-label="Eyedropper">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="m14 7 3 3"/>
              <path d="m5 19 6.5-6.5"/>
              <path d="M14 7 7 14"/>
              <path d="m16 5 3 3"/>
              <path d="M9 16 5 20"/>
            </svg>
          </button>
        {/if}
      </div>

      {#if presets.length > 0}
        <div class="color-picker-presets">
          {#each presets as preset (preset)}
            <button
              type="button"
              class="color-picker-preset"
              class:active={normalizeHexColor(preset) === lastSyncedHex}
              aria-label={preset.toUpperCase()}
              style={`background:${normalizeHexColor(preset)}`}
              onclick={() => dispatchColor(preset)}
            ></button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .color-picker {
    padding: 4px 16px 12px;
  }

  .color-picker-label {
    margin-bottom: 8px;
    font-size: 13px;
    color: var(--md-on-surface-variant);
  }

  .color-picker-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 132px;
    gap: 8px;
    align-items: center;
  }

  .color-picker-trigger,
  .color-picker-hex-input,
  .color-picker-eye {
    min-height: 46px;
    border-radius: 18px;
    border: 1px solid color-mix(in srgb, var(--md-outline-variant) 82%, transparent);
    background: color-mix(in srgb, var(--md-surface-container-low) 86%, transparent);
    color: var(--md-on-surface);
    transition:
      border-color var(--md-duration-short) var(--md-easing-standard),
      background var(--md-duration-short) var(--md-easing-standard),
      transform var(--md-duration-short) var(--md-easing-standard);
  }

  .color-picker-trigger {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 0 14px;
    cursor: pointer;
  }

  .color-picker-trigger:hover,
  .color-picker-eye:hover {
    background: var(--md-surface-container);
    border-color: var(--md-outline);
    transform: scale(1.02);
  }

  .color-picker-trigger:active,
  .color-picker-eye:active {
    transform: scale(0.98);
  }

  .color-picker-trigger-swatch {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
    flex-shrink: 0;
  }

  .color-picker-trigger-value {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: var(--md-primary);
    transition: transform 0.24s cubic-bezier(0.2, 0, 0, 1);
  }

  .color-picker-trigger-icon {
    margin-left: auto;
    color: var(--md-on-surface-variant);
    transition: transform 0.24s cubic-bezier(0.2, 0, 0, 1);
  }

  .color-picker-trigger:hover .color-picker-trigger-value,
  .color-picker-trigger:hover .color-picker-trigger-icon {
    transform: translateY(-1px);
  }

  .color-picker-hex-input {
    width: 100%;
    padding: 0 14px;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    text-transform: uppercase;
  }

  .color-picker-hex-input:focus {
    outline: none;
    border-color: var(--md-primary);
    background: var(--md-surface-container);
  }

  .color-picker-panel {
    margin-top: 10px;
    padding: 14px;
    border-radius: 24px;
    border: 1px solid color-mix(in srgb, var(--md-outline-variant) 82%, transparent);
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--md-primary) 14%, transparent), transparent 38%),
      var(--md-surface-container-low);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.16);
  }

  .color-picker-panel-floating {
    position: fixed;
    margin-top: 0;
    z-index: 2600;
    background: var(--md-surface-container);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
  }

  .color-picker-plane {
    position: relative;
    aspect-ratio: 1 / 1;
    width: 100%;
    border-radius: 20px;
    cursor: crosshair;
    overflow: hidden;
  }

  .color-picker-handle {
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.28);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .color-picker-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
  }

  .color-picker-hue-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  .color-picker-hue-icon {
    color: var(--md-on-surface-variant);
    flex-shrink: 0;
  }

  .color-picker-hue-slider {
    flex: 1;
    height: 14px;
    margin: 0;
    appearance: none;
    border-radius: 999px;
    background: linear-gradient(90deg, #ff4d4d, #ffad33, #fff44d, #52ff66, #3ed8ff, #5a75ff, #b86bff, #ff4db8, #ff4d4d);
    cursor: pointer;
  }

  .color-picker-hue-slider::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 2px solid #fff;
    background: var(--md-surface);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.28);
  }

  .color-picker-hue-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: 2px solid #fff;
    border-radius: 999px;
    background: var(--md-surface);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.28);
  }

  .color-picker-eye {
    width: 46px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .color-picker-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }

  .color-picker-preset {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 2px solid color-mix(in srgb, var(--md-surface) 92%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--md-outline-variant) 82%, transparent);
    cursor: pointer;
    transition: transform var(--md-duration-short) var(--md-easing-standard), box-shadow var(--md-duration-short) var(--md-easing-standard);
  }

  .color-picker-preset:hover {
    transform: scale(1.08);
  }

  .color-picker-preset.active {
    box-shadow:
      0 0 0 2px var(--md-primary),
      0 0 0 4px color-mix(in srgb, var(--md-surface) 88%, transparent);
  }

  @media (max-width: 520px) {
    .color-picker-row {
      grid-template-columns: 1fr;
    }
  }
</style>
