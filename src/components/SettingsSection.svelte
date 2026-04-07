<script lang="ts">
  export let title = '';
  export let hidden = false;
  export let icon = '';
</script>

{#if !hidden}
  <section class="settings-section">
    <h2 class="section-title">
      {#if icon}
        <svg class="section-icon" viewBox="0 -960 960 960" width="16" height="16" fill="currentColor"><path d={icon}/></svg>
      {/if}
      {title}
    </h2>
    <div class="section-content">
      <slot />
    </div>
  </section>
{/if}

<style>
  .settings-section {
    padding: 4px 16px 8px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--md-primary);
    padding: 12px 0 4px;
    transition: color 0.2s ease;
  }

  .section-icon {
    flex-shrink: 0;
    opacity: 0.8;
    transition: transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  .settings-section:hover .section-icon {
    transform: scale(1.15);
  }

  .settings-section:hover .section-title {
    color: var(--md-primary);
    opacity: 1;
  }

  .section-content {
    background: var(--md-surface-container);
    border-radius: var(--md-shape-lg);
    padding: 4px 0;
    overflow: hidden;
    transition: box-shadow 0.25s cubic-bezier(0.2, 0, 0, 1),
                transform 0.25s cubic-bezier(0.2, 0, 0, 1);
  }

  .section-content:hover {
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }
</style>
