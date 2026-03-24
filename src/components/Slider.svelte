<script lang="ts">
  let { label, value = 0, min = 0, max = 8, defaultLabel = '', onchange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    defaultLabel: string;
    onchange: (value: number) => void;
  } = $props();

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    onchange(Number(target.value));
  }

  let displayValue = $derived(value === 0 && defaultLabel ? defaultLabel : String(value));
  let percent = $derived(((value - min) / (max - min)) * 100);
</script>

<div class="slider-row">
  <div class="slider-header">
    <span class="slider-label">{label}</span>
    <span class="slider-value">{displayValue}</span>
  </div>
  <div class="slider-track-container">
    <input
      type="range"
      class="slider-input"
      {min}
      {max}
      step="1"
      {value}
      style="--percent: {percent}%"
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
  }

  .slider-track-container {
    position: relative;
    height: 20px;
    display: flex;
    align-items: center;
  }

  .slider-input {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: var(--md-shape-full);
    background: linear-gradient(
      to right,
      var(--md-primary) 0%,
      var(--md-primary) var(--percent),
      var(--md-surface-container-highest) var(--percent),
      var(--md-surface-container-highest) 100%
    );
    outline: none;
    cursor: pointer;
  }

  .slider-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: var(--md-shape-full);
    background: var(--md-primary);
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px 1px rgba(0, 0, 0, 0.15);
    transition: transform var(--md-duration-short) var(--md-easing-standard);
  }

  .slider-input::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  .slider-input::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border: none;
    border-radius: var(--md-shape-full);
    background: var(--md-primary);
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px 1px rgba(0, 0, 0, 0.15);
  }

  .slider-input::-moz-range-thumb:hover {
    transform: scale(1.1);
  }
</style>
