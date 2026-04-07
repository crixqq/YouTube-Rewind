<script lang="ts">
  import { onDestroy } from 'svelte';

  export let label = '';
  export let value = 0;
  export let min = 0;
  export let max = 8;
  export let defaultLabel = '';
  export let onchange: (value: number) => void = () => {};
  export let formatDisplay: ((value: number) => string) | undefined = undefined;
  export let parseInput: ((text: string) => number) | undefined = undefined;

  let editing = false;
  let editText = '';
  let hovering = false;
  let pressing = false;
  let trackWidth = 300;

  let phase = 0;
  let animating = false;
  let rafId = 0;
  let lastTime = 0;
  let currentAmp = 3;
  let targetAmp = 3;

  let editable = true;
  let displayValue = '';
  let percent = 0;
  let wavePath = '';
  let inactiveStart = 14;

  function tick(time: number): void {
    if (!animating) return;

    const dt = lastTime ? (time - lastTime) / 1000 : 0.016;
    lastTime = time;

    const speed = pressing ? 80 : hovering ? 50 : 30;
    phase += speed * dt;
    currentAmp += (targetAmp - currentAmp) * Math.min(1, dt * 8);

    rafId = requestAnimationFrame(tick);
  }

  function handleInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    onchange(Number(target.value));
  }

  function startEditing(): void {
    if (!editable) return;
    editing = true;
    editText = formatDisplay ? formatDisplay(value) : String(value);
  }

  function commitEdit(): void {
    editing = false;

    let nextValue: number;
    if (parseInput) {
      nextValue = parseInput(editText);
    } else {
      nextValue = parseInt(editText, 10);
      if (Number.isNaN(nextValue)) nextValue = min;
    }

    if (nextValue > max) nextValue = max;
    if (nextValue < min) nextValue = min;
    onchange(nextValue);
  }

  function handleEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') commitEdit();
    else if (event.key === 'Escape') editing = false;
  }

  $: editable = !formatDisplay || !!parseInput;
  $: displayValue = formatDisplay ? formatDisplay(value) : (value === 0 && defaultLabel ? defaultLabel : String(value));
  $: percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  $: targetAmp = pressing ? 6 : hovering ? 5 : 3;

  $: {
    const shouldAnimate = hovering || pressing;
    if (shouldAnimate && !animating) {
      animating = true;
      lastTime = 0;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    } else if (!shouldAnimate && animating) {
      animating = false;
      cancelAnimationFrame(rafId);
    }
  }

  $: {
    const cy = 12;
    const activeWidth = Math.max(0, (percent / 100) * trackWidth - 14);
    const amplitude = currentAmp;
    const waveLength = pressing ? 26 : hovering ? 30 : 34;

    if (activeWidth < 4) {
      wavePath = '';
    } else {
      const points: string[] = [`M 3 ${cy}`];
      for (let x = 1; x <= activeWidth; x += 1.5) {
        const y = cy + amplitude * Math.sin(((x + phase) / waveLength) * Math.PI * 2);
        points.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      const endY = cy + amplitude * Math.sin(((activeWidth + phase) / waveLength) * Math.PI * 2);
      points.push(`L ${activeWidth.toFixed(1)} ${endY.toFixed(1)}`);
      wavePath = points.join(' ');
    }

    inactiveStart = Math.min(trackWidth, (percent / 100) * trackWidth + 14);
  }

  onDestroy(() => {
    cancelAnimationFrame(rafId);
  });
</script>

<div class="slider-row">
  <div class="slider-header">
    <span class="slider-label">{label}</span>
    {#if editing}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="slider-text-input"
        type="text"
        bind:value={editText}
        onblur={commitEdit}
        onkeydown={handleEditKeydown}
        autofocus
      />
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <span class="slider-value" class:slider-value-editable={editable} onclick={startEditing} title={editable ? 'Click to edit' : ''}>{displayValue}</span>
    {/if}
  </div>
  <div
    class="slider-track-container"
    class:hovering
    class:pressing
    bind:clientWidth={trackWidth}
    onmouseenter={() => { hovering = true; }}
    onmouseleave={() => { hovering = false; pressing = false; }}
    onmousedown={() => { pressing = true; }}
    onmouseup={() => { pressing = false; }}
  >
    <svg class="slider-wave-svg" width={trackWidth} height="24">
      {#if wavePath}
        <path
          d={wavePath}
          fill="none"
          stroke="var(--md-primary)"
          stroke-width={pressing ? 6 : 4}
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {/if}
      <line
        x1={inactiveStart}
        y1="12"
        x2={trackWidth - 3}
        y2="12"
        stroke="var(--md-surface-container-highest)"
        stroke-width="4"
        stroke-linecap="round"
      />
    </svg>

    <div class="slider-thumb" style={`left: ${percent}%`}>
      <div class="slider-thumb-inner"></div>
    </div>

    <input
      type="range"
      class="slider-input-hidden"
      {min}
      {max}
      step="1"
      {value}
      oninput={handleInput}
    />
  </div>
</div>

<style>
  .slider-row {
    padding: 10px 16px;
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .slider-label {
    font-size: 14px;
    color: var(--md-on-surface);
  }

  .slider-value {
    font-size: 14px;
    font-weight: 500;
    color: var(--md-primary);
    min-width: 32px;
    text-align: right;
    transition: color 0.15s ease, transform 0.15s ease;
  }

  .slider-value-editable {
    cursor: pointer;
    border-bottom: 1px dashed var(--md-outline-variant);
    padding-bottom: 1px;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .slider-value-editable:hover {
    color: var(--md-on-surface);
    border-color: var(--md-primary);
  }

  .slider-value-editable:active {
    transform: scale(0.95);
  }

  .slider-text-input {
    width: 72px;
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    color: var(--md-primary);
    background: var(--md-surface-container);
    border: 1px solid var(--md-primary);
    border-radius: var(--md-shape-xs);
    padding: 2px 6px;
    text-align: right;
    outline: none;
    animation: inputPop 0.15s cubic-bezier(0.18, 0.89, 0.32, 1.28) both;
  }

  @keyframes inputPop {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
  }

  .slider-track-container {
    position: relative;
    height: 24px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .slider-wave-svg {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    overflow: visible;
  }

  .slider-wave-svg path {
    transition: stroke-width 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  .slider-wave-svg line {
    transition: stroke-width 0.2s ease;
  }

  .slider-thumb {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 2;
  }

  .slider-thumb-inner {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--md-primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.15);
    transition: width 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28),
                height 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28),
                box-shadow 0.2s ease;
  }

  .slider-track-container.hovering .slider-thumb-inner {
    width: 24px;
    height: 24px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35), 0 2px 8px 1px rgba(0, 0, 0, 0.2);
  }

  .slider-track-container.pressing .slider-thumb-inner {
    width: 28px;
    height: 28px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4), 0 4px 12px 2px rgba(0, 0, 0, 0.2);
  }

  .slider-input-hidden {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    margin: 0;
    z-index: 3;
  }
</style>
