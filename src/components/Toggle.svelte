<script lang="ts">
  export let label = '';
  export let checked = false;
  export let onchange: (value: boolean) => void = () => {};

  function handleChange(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    onchange(target.checked);
  }
</script>

<label class="toggle-row">
  <span class="toggle-label">{label}</span>
  <div class="toggle-track" class:active={checked}>
    <div class="toggle-thumb">
      <svg class="toggle-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <input type="checkbox" class="toggle-input" checked={checked} onchange={handleChange} />
  </div>
</label>

<style>
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    cursor: pointer;
    transition: background var(--md-duration-short) var(--md-easing-standard);
    gap: 12px;
  }

  .toggle-row:hover {
    background: var(--md-surface-container-high);
  }

  .toggle-row:hover .toggle-label {
    color: var(--md-on-surface);
  }

  .toggle-row:active {
    background: var(--md-surface-container-highest);
  }

  .toggle-row:active .toggle-track:not(.active) .toggle-thumb {
    width: 26px;
    height: 18px;
  }

  .toggle-row:active .toggle-track.active .toggle-thumb {
    left: calc(100% - 30px);
    width: 28px;
    height: 26px;
  }

  .toggle-row:active .toggle-track {
    transform: scaleY(0.92);
  }

  .toggle-label {
    font-size: 14px;
    color: var(--md-on-surface);
    flex: 1;
    user-select: none;
    transition: color 0.15s ease;
  }

  .toggle-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    margin: 0;
  }

  .toggle-track {
    position: relative;
    width: 52px;
    height: 32px;
    border-radius: var(--md-shape-full);
    background: var(--md-surface-container-highest);
    border: 2px solid var(--md-outline);
    transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
    flex-shrink: 0;
  }

  .toggle-track.active {
    background: var(--md-primary);
    border-color: var(--md-primary);
  }

  .toggle-thumb {
    position: absolute;
    top: 50%;
    left: 6px;
    width: 16px;
    height: 16px;
    border-radius: var(--md-shape-full);
    background: var(--md-outline);
    transform: translateY(-50%);
    transition: left 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28),
                width 0.25s cubic-bezier(0.2, 0, 0, 1),
                height 0.25s cubic-bezier(0.2, 0, 0, 1),
                background 0.2s cubic-bezier(0.2, 0, 0, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    pointer-events: none;
  }

  .toggle-track.active .toggle-thumb {
    left: calc(100% - 26px);
    width: 24px;
    height: 24px;
    background: var(--md-on-primary);
  }

  .toggle-check {
    color: var(--md-primary);
    opacity: 0;
    transform: scale(0) rotate(-45deg);
    transition: opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  .toggle-track.active .toggle-check {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
</style>
