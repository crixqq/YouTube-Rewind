<script lang="ts">
  let { label, checked = false, onchange }: {
    label: string;
    checked: boolean;
    onchange: (value: boolean) => void;
  } = $props();

  function handleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    onchange(target.checked);
  }
</script>

<label class="toggle-row">
  <span class="toggle-label">{label}</span>
  <div class="toggle-track" class:active={checked}>
    <div class="toggle-thumb"></div>
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

  .toggle-label {
    font-size: 14px;
    color: var(--md-on-surface);
    flex: 1;
    user-select: none;
  }

  .toggle-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    position: relative;
    width: 52px;
    height: 32px;
    border-radius: var(--md-shape-full);
    background: var(--md-surface-container-highest);
    border: 2px solid var(--md-outline);
    transition: all var(--md-duration-short) var(--md-easing-standard);
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
    transition: all var(--md-duration-short) var(--md-easing-emphasized);
  }

  .toggle-track.active .toggle-thumb {
    left: calc(100% - 26px);
    width: 24px;
    height: 24px;
    background: var(--md-on-primary);
  }
</style>
