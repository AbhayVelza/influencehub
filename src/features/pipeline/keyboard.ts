import type { KeyboardCodes, KeyboardCoordinateGetter } from '@dnd-kit/core'

/** Space picks up and drops; Escape cancels. Enter is left alone so it never doubles as a link click. */
export const PIPELINE_KEYBOARD_CODES: KeyboardCodes = {
  start: ['Space'],
  cancel: ['Escape'],
  end: ['Space'],
}

/** Left/Right jump the picked-up card to the previous/next column instead of nudging it by pixels. */
export const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const step = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0
  if (!step) return undefined
  event.preventDefault()

  const { droppableRects, droppableContainers, over, collisionRect } = context
  if (!collisionRect) return currentCoordinates
  const columns = droppableContainers
    .getEnabled()
    .map((c) => ({ id: c.id, rect: droppableRects.get(c.id) }))
    .filter((c): c is { id: typeof c.id; rect: NonNullable<typeof c.rect> } => !!c.rect)
    .sort((a, b) => a.rect.left - b.rect.left)
  if (!columns.length) return currentCoordinates

  let index = columns.findIndex((c) => c.id === over?.id)
  if (index === -1) {
    const centre = collisionRect.left + collisionRect.width / 2
    index = columns.findIndex((c) => centre >= c.rect.left && centre <= c.rect.left + c.rect.width)
  }
  const next = columns[Math.min(columns.length - 1, Math.max(0, index + step))]!
  return {
    x: currentCoordinates.x + (next.rect.left + 8 - collisionRect.left),
    y: currentCoordinates.y + (next.rect.top + 56 - collisionRect.top),
  }
}
