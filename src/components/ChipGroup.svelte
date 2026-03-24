<script lang="ts">
  let { filters }: {
    filters: Array<{ key: string; label: string; checked: boolean; onchange: (v: boolean) => void }>;
  } = $props();
</script>

<div class="chip-group">
  {#each filters as filter (filter.key)}
    <button
      class="chip"
      class:active={filter.checked}
      onclick={() => filter.onchange(!filter.checked)}
    >
      {#if filter.checked}
        <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="14 5 7 12 4 9"/>
        </svg>
      {/if}
      {filter.label}
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
    transition: all var(--md-duration-short) var(--md-easing-standard);
    user-select: none;
  }

  .chip:hover {
    background: var(--md-surface-container-high);
  }

  .chip.active {
    background: var(--md-secondary-container);
    color: var(--md-on-secondary-container);
    border-color: transparent;
  }

  .chip:active {
    transform: scale(0.95);
  }
</style>
