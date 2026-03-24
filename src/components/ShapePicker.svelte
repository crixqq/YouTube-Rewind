<script lang="ts">
  let { value = 'none', variant = 'avatar', onchange }: {
    value: string;
    variant: string;
    onchange: (value: string) => void;
  } = $props();

  const shapes = [
    { id: 'none', svgContent: '<circle cx="16" cy="16" r="13" fill="currentColor"/>' },
    { id: 'superellipse', svgContent: '<rect x="3" y="3" width="26" height="26" rx="6" fill="currentColor"/>' },
    { id: 'rounded-square', svgContent: '<rect x="3" y="3" width="26" height="26" rx="3" fill="currentColor"/>' },
    { id: 'diamond', svgContent: '<rect x="5" y="5" width="22" height="22" rx="5" fill="currentColor" transform="rotate(45 16 16)"/>' },
    { id: 'hexagon', svgContent: '<path d="M18,1.5 L28,7.2 Q30,8.5,30,11 L30,21 Q30,23.5,28,24.8 L18,30.5 Q16,31.7,14,30.5 L4,24.8 Q2,23.5,2,21 L2,11 Q2,8.5,4,7.2 L14,1.5 Q16,0.3,18,1.5Z" fill="currentColor"/>' },
    { id: 'octagon', svgContent: '<path d="M11,2 L21,2 Q23,2,25,4 L28,7 Q30,9,30,11 L30,21 Q30,23,28,25 L25,28 Q23,30,21,30 L11,30 Q9,30,7,28 L4,25 Q2,23,2,21 L2,11 Q2,9,4,7 L7,4 Q9,2,11,2Z" fill="currentColor"/>' },
    { id: 'clover', svgContent: '<path d="M16,1 C20.5,1,21.8,5.8,26.2,7.8 C30.4,9.7,31,13.5,31,16 C31,20.5,26.2,21.8,24.2,26.2 C22.3,30.4,18.5,31,16,31 C11.5,31,10.2,26.2,5.8,24.2 C1.6,22.3,1,18.5,1,16 C1,11.5,5.8,10.2,7.8,5.8 C9.7,1.6,13.5,1,16,1Z" fill="currentColor"/>' },
    { id: 'flower', svgContent: '<path d="M26.8,5.2 C30,8.4,28.1,11.7,29.9,16 C31.3,20.1,30,23.6,26.8,26.8 C23.6,30,20.3,28.1,16,29.9 C11.9,31.3,8.4,30,5.2,26.8 C2,23.6,3.9,20.3,2.1,16 C0.7,11.9,2,8.4,5.2,5.2 C8.4,2,11.7,3.9,16,2.1 C20.1,0.7,23.6,2,26.8,5.2Z" fill="currentColor"/>' },
    { id: 'square', svgContent: '<rect x="3" y="3" width="26" height="26" fill="currentColor"/>' },
  ];
</script>

<div class="shape-picker" role="radiogroup">
  {#each shapes as shape (shape.id)}
    <button
      class="shape-option"
      class:active={value === shape.id}
      role="radio"
      aria-checked={value === shape.id}
      onclick={() => onchange(shape.id)}
    >
      <svg viewBox="0 0 32 32" width="36" height="36" class="shape-icon">
        {@html shape.svgContent}
      </svg>
    </button>
  {/each}
</div>

<style>
  .shape-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px;
    justify-content: center;
  }

  .shape-option {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border: none;
    border-radius: var(--md-shape-lg);
    background: var(--md-surface-container-high);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.2, 0, 0, 1),
                transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    padding: 0;
  }

  .shape-option:hover {
    background: var(--md-surface-container-highest);
    transform: scale(1.08);
  }

  .shape-option:active {
    transform: scale(0.92);
  }

  .shape-option.active {
    background: var(--md-primary);
    box-shadow: 0 0 0 2px var(--md-primary), 0 0 0 4px var(--md-surface);
    transform: scale(1);
  }

  .shape-icon {
    color: var(--md-on-surface-variant);
    transition: color 0.2s cubic-bezier(0.2, 0, 0, 1),
                transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  .shape-option.active .shape-icon {
    color: var(--md-on-primary);
  }
</style>
