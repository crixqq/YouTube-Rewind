<script lang="ts">
  import Toggle from './Toggle.svelte';

  let { filters }: {
    filters: Array<{ key: string; label: string; checked: boolean; onchange: (v: boolean) => void }>;
  } = $props();
</script>

<div class="filter-group">
  {#each filters as filter (filter.key)}
    <Toggle label={filter.label} checked={filter.checked} onchange={filter.onchange} />
  {/each}
</div>

<style>
  .filter-group {
    display: flex;
    flex-direction: column;
  }
</style>
