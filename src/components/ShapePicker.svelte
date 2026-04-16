<script lang="ts">
  type ShapeItem = {
    id: string;
    svgContent: string;
    label?: string;
    viewBox?: string;
  };

  type Props = {
    value?: string;
    variant?: 'avatar' | 'thumbnail';
    onchange?: (value: string) => void;
    items?: ShapeItem[];
  };

  let {
    value = 'none',
    variant = 'avatar',
    onchange = () => {},
    items = [],
  }: Props = $props();

  const avatarFallbackItems: ShapeItem[] = [
    { id: 'none', label: 'Default', svgContent: '<circle cx="16" cy="16" r="13" fill="currentColor"/>' },
    { id: 'superellipse', label: 'Squircle', svgContent: '<rect x="3" y="3" width="26" height="26" rx="6" fill="currentColor"/>' },
    { id: 'rounded-square', label: 'Rounded', svgContent: '<rect x="3" y="3" width="26" height="26" rx="3" fill="currentColor"/>' },
    { id: 'diamond', label: 'Diamond', svgContent: '<rect x="5" y="5" width="22" height="22" rx="5" fill="currentColor" transform="rotate(45 16 16)"/>' },
    { id: 'hexagon', label: 'Hexagon', svgContent: '<path d="M18,1.5 L28,7.2 Q30,8.5,30,11 L30,21 Q30,23.5,28,24.8 L18,30.5 Q16,31.7,14,30.5 L4,24.8 Q2,23.5,2,21 L2,11 Q2,8.5,4,7.2 L14,1.5 Q16,0.3,18,1.5Z" fill="currentColor"/>' },
    { id: 'octagon', label: 'Octagon', svgContent: '<path d="M11,2 L21,2 Q23,2,25,4 L28,7 Q30,9,30,11 L30,21 Q30,23,28,25 L25,28 Q23,30,21,30 L11,30 Q9,30,7,28 L4,25 Q2,23,2,21 L2,11 Q2,9,4,7 L7,4 Q9,2,11,2Z" fill="currentColor"/>' },
    { id: 'clover', label: 'Clover', svgContent: '<path d="M16,1 C20.5,1,21.8,5.8,26.2,7.8 C30.4,9.7,31,13.5,31,16 C31,20.5,26.2,21.8,24.2,26.2 C22.3,30.4,18.5,31,16,31 C11.5,31,10.2,26.2,5.8,24.2 C1.6,22.3,1,18.5,1,16 C1,11.5,5.8,10.2,7.8,5.8 C9.7,1.6,13.5,1,16,1Z" fill="currentColor"/>' },
    { id: 'flower', label: 'Flower', svgContent: '<path d="M26.8,5.2 C30,8.4,28.1,11.7,29.9,16 C31.3,20.1,30,23.6,26.8,26.8 C23.6,30,20.3,28.1,16,29.9 C11.9,31.3,8.4,30,5.2,26.8 C2,23.6,3.9,20.3,2.1,16 C0.7,11.9,2,8.4,5.2,5.2 C8.4,2,11.7,3.9,16,2.1 C20.1,0.7,23.6,2,26.8,5.2Z" fill="currentColor"/>' },
    { id: 'square', label: 'Square', svgContent: '<rect x="3" y="3" width="26" height="26" fill="currentColor"/>' },
  ];

  const thumbnailFallbackItems: ShapeItem[] = [
    { id: 'none', label: 'Default', viewBox: '0 0 44 28', svgContent: '<rect x="2" y="4" width="40" height="20" rx="10" fill="currentColor"/>' },
    { id: 'sharp', label: 'Sharp', viewBox: '0 0 44 28', svgContent: '<rect x="2" y="4" width="40" height="20" fill="currentColor"/>' },
    { id: 'rounded', label: 'Rounded', viewBox: '0 0 44 28', svgContent: '<rect x="2" y="4" width="40" height="20" rx="6" fill="currentColor"/>' },
    { id: 'notched', label: 'Notched', viewBox: '0 0 44 28', svgContent: '<path d="M8,4 H36 L42,10 V18 L36,24 H8 L2,18 V10 Z" fill="currentColor"/>' },
    { id: 'slanted', label: 'Slanted', viewBox: '0 0 44 28', svgContent: '<path d="M6,4 H42 L38,24 H2 Z" fill="currentColor"/>' },
    { id: 'arch', label: 'Arch', viewBox: '0 0 44 28', svgContent: '<path d="M8,24 H36 Q40,24 40,20 V14 Q40,4 22,4 Q4,4 4,14 V20 Q4,24 8,24 Z" fill="currentColor"/>' },
  ];

  let fallbackItems = $derived(variant === 'thumbnail' ? thumbnailFallbackItems : avatarFallbackItems);
  let resolvedItems = $derived(items.length ? items : fallbackItems);
  let pickerLabel = $derived(variant === 'thumbnail' ? 'Thumbnail shape picker' : 'Avatar shape picker');
</script>

<div class="shape-picker" class:shape-picker-thumbnail={variant === 'thumbnail'} role="radiogroup" aria-label={pickerLabel}>
  {#each resolvedItems as shape (shape.id)}
    <button
      type="button"
      class="shape-option"
      class:shape-option-thumbnail={variant === 'thumbnail'}
      class:active={value === shape.id}
      role="radio"
      aria-checked={value === shape.id}
      aria-label={shape.label || shape.id}
      title={shape.label || shape.id}
      onclick={() => onchange(shape.id)}
    >
      <svg
        viewBox={shape.viewBox || (variant === 'thumbnail' ? '0 0 44 28' : '0 0 32 32')}
        width={variant === 'thumbnail' ? '52' : '36'}
        height={variant === 'thumbnail' ? '32' : '36'}
        class="shape-icon"
      >
        {@html shape.svgContent}
      </svg>
    </button>
  {/each}
</div>

<style>
  .shape-picker {
    display: grid;
    grid-template-columns: repeat(auto-fit, 46px);
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
  }

  .shape-picker-thumbnail {
    grid-template-columns: repeat(auto-fit, 72px);
    gap: 10px;
  }

  .shape-option {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--md-outline-variant) 82%, transparent);
    border-radius: var(--md-shape-md);
    background: var(--md-surface-container-high);
    color: var(--md-on-surface-variant);
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
    transition:
      transform 0.2s cubic-bezier(0.2, 0, 0, 1),
      background-color 0.2s cubic-bezier(0.2, 0, 0, 1),
      border-color 0.2s cubic-bezier(0.2, 0, 0, 1),
      box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1),
      color 0.2s cubic-bezier(0.2, 0, 0, 1);
  }

  .shape-option-thumbnail {
    width: 72px;
    height: 52px;
    border-radius: var(--md-shape-lg);
  }

  .shape-option::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    pointer-events: none;
    border-radius: inherit;
    transition: opacity 0.14s ease;
  }

  .shape-option:hover::after {
    opacity: 0.05;
  }

  .shape-option:hover {
    background: var(--md-surface-container-highest);
    transform: scale(1.08);
  }

  .shape-option:active {
    transform: scale(0.88);
    transition-duration: 0.06s;
  }

  .shape-option.active {
    background: var(--md-primary);
    color: var(--md-on-primary);
    border-color: var(--md-primary);
    box-shadow: none;
    animation: shapeSelect 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  .shape-option.active:hover {
    transform: scale(1.08);
  }

  .shape-option.active:active {
    transform: scale(0.88);
  }

  @keyframes shapeSelect {
    0% { transform: scale(0.85); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }

  .shape-option:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--md-primary) 70%, transparent);
    outline-offset: 2px;
  }

  .shape-icon {
    color: inherit;
    transition:
      transform 0.2s cubic-bezier(0.2, 0, 0, 1),
      color 0.2s cubic-bezier(0.2, 0, 0, 1);
    flex-shrink: 0;
  }

  .shape-option:hover .shape-icon {
    transform: scale(1.1) rotate(5deg);
  }

  .shape-option:active .shape-icon {
    transform: scale(0.85);
  }

  :global(body[data-ytr-theme-mode="light"]) .shape-option.active {
    background: color-mix(in srgb, var(--md-primary-container) 88%, white 12%);
    color: var(--md-on-primary-container);
    border-color: color-mix(in srgb, var(--md-primary) 58%, var(--md-primary-container));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--md-primary) 18%, transparent) inset,
      0 1px 2px rgba(0, 0, 0, 0.06);
  }
</style>
