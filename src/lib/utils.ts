import { createCn } from 'cn/config'

/**
 * clsx + tailwind-merge, taught the custom theme scales from src/index.css. Without this, merging treats
 * `text-body` as a colour (and drops it next to `text-muted-foreground`), and doesn't know `p-space-md` or
 * `shadow-glass`.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: ['h1', 'h2', 'h3', 'body', 'small'],
      spacing: ['space-xs', 'space-sm', 'space-md', 'space-lg', 'space-xl', 'gutter', 'gutter-sm', 'margin', 'margin-mobile'],
      shadow: ['glass', 'glass-hover', 'glass-glow', 'bar'],
    },
  },
})
