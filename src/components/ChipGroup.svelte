<script lang="ts">
  export interface ChipFilter {
    key: string;
    label: string;
    checked: boolean;
    onchange: (value: boolean) => void;
  }

  export let filters: ChipFilter[] = [];
</script>

<div class="chip-group">
  {#each filters as filter (filter.key)}
    <button
      class="chip"
      class:active={filter.checked}
      onclick={() => filter.onchange(!filter.checked)}
    >
      {#if filter.checked}
        <svg class="chip-check" viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="14 5 7 12 4 9"/>
        </svg>
      {/if}
      <span class="chip-label">{filter.label}</span>
    </button>
  {/each}
</div>

<style>
  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--md-outline-variant);
    border-radius: var(--md-shape-sm);
    background: transparent;
    color: var(--md-on-surface-variant);
    font-size: 13px;
    font-family: inherit;
    line-height: 1.1;
    cursor: pointer;
    transition:
      transform 0.2s cubic-bezier(0.2, 0, 0, 1),
      background-color 0.2s cubic-bezier(0.2, 0, 0, 1),
      color 0.2s cubic-bezier(0.2, 0, 0, 1),
      border-color 0.2s cubic-bezier(0.2, 0, 0, 1),
      box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1);
    user-select: none;
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
  }

  .chip::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }

  .chip:hover::after {
    opacity: 0.06;
  }

  .chip:hover {
    background: var(--md-surface-container-high);
    transform: scale(1.03);
  }

  .chip:hover .chip-label {
    transform: translateY(-1px);
  }

  .chip.active {
    background: var(--md-secondary-container);
    color: var(--md-on-secondary-container);
    border-color: transparent;
    box-shadow: none;
    padding-left: 8px;
  }

  .chip.active:hover {
    transform: scale(1.03);
  }

  .chip:active {
    transform: scale(0.97);
    transition-duration: 0.08s;
  }

  .chip-label {
    transition: transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  .chip:active .chip-label {
    transform: translateY(0) scale(0.96);
  }

  .chip-check {
    flex-shrink: 0;
    animation: chipCheckBounce 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) both;
  }

  :global(body[data-ytr-theme-mode="light"]) .chip.active {
    background: color-mix(in srgb, var(--md-secondary-container) 76%, var(--md-primary-container) 24%);
    color: var(--md-on-secondary-container);
    border-color: color-mix(in srgb, var(--md-primary) 58%, var(--md-secondary-container));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--md-primary) 18%, transparent) inset,
      0 1px 2px rgba(0, 0, 0, 0.06);
  }

  @keyframes chipCheckBounce {
    0% { opacity: 0; transform: scale(0) rotate(-90deg); }
    60% { opacity: 1; transform: scale(1.2) rotate(5deg); }
    100% { opacity: 1; transform: scale(1) rotate(0); }
  }
</style>
