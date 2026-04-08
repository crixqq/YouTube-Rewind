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
    gap: 4px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--md-outline-variant);
    border-radius: var(--md-shape-sm);
    background: transparent;
    color: var(--md-on-surface-variant);
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    user-select: none;
    position: relative;
    overflow: hidden;
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

  .chip.active {
    background: var(--md-secondary-container);
    color: var(--md-on-secondary-container);
    border-color: transparent;
    padding-left: 8px;
  }

  .chip.active:hover {
    transform: scale(1.03);
  }

  .chip:active {
    transform: scale(0.93);
    transition-duration: 0.08s;
  }

  .chip-label {
    transition: transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  .chip:active .chip-label {
    transform: scale(0.96);
  }

  .chip-check {
    flex-shrink: 0;
    animation: chipCheckBounce 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) both;
  }

  @keyframes chipCheckBounce {
    0% { opacity: 0; transform: scale(0) rotate(-90deg); }
    60% { opacity: 1; transform: scale(1.2) rotate(5deg); }
    100% { opacity: 1; transform: scale(1) rotate(0); }
  }
</style>
