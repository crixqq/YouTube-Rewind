<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section class="settings-section">
  <h2 class="section-title">{title}</h2>
  <div class="section-content">
    {@render children()}
  </div>
</section>

<style>
  .settings-section {
    padding: 4px 16px 8px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--md-primary);
    padding: 12px 0 4px;
  }

  .section-content {
    background: var(--md-surface-container);
    border-radius: var(--md-shape-lg);
    padding: 4px 0;
    overflow: hidden;
  }
</style>
