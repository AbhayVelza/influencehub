import { createCn } from 'cn/config'

/**
 * clsx + tailwind-merge, taught the custom theme scales from src/index.css. Without this, merging treats
 * `text-label-md` as a colour (and drops it next to `text-muted-foreground`), and doesn't know `p-space-md` or
 * `shadow-glass`.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: [
        'display-lg',
        'display-lg-mobile',
        'headline-xl',
        'headline-xl-mobile',
        'headline-md',
        'headline-sm',
        'body-lg',
        'body-md',
        'body-sm',
        'label-md',
        'label-sm',
        'code',
      ],
      spacing: ['space-xs', 'space-sm', 'space-md', 'space-lg', 'space-xl', 'gutter', 'gutter-sm', 'margin', 'margin-mobile'],
      shadow: ['glass', 'glass-hover', 'glass-glow', 'bar'],
    },
  },
})
