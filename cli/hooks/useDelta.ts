import { useState, useEffect, useRef } from 'react'

type ItemWithId = { id: string; [key: string]: any }

/**
 * A hook to manage appending items to Ink's <Static> component.
 * It takes the full list of items and returns only the new items
 * that haven't been rendered by <Static> yet.
 *
 * @param items The full list of items (must have unique `id` properties).
 * @returns An array containing only the items that are new since the last render cycle.
 */
export function useDelta<T extends ItemWithId>(items: T[]): T[] {
  const [renderedIds, setRenderedIds] = useState(() => new Set<string>())
  const [newItems, setNewItems] = useState<T[]>([])
  const isUpdatingRef = useRef(false) // Prevent potential race conditions/double updates

  useEffect(() => {
    // Avoid processing if an update is already scheduled
    if (isUpdatingRef.current) return

    // Find items that are in the full list but not yet marked as rendered
    const itemsToAdd = items.filter((item) => !renderedIds.has(item.id))

    if (itemsToAdd.length > 0) {
      isUpdatingRef.current = true
      // Set the new items to be rendered by Static in *this* render pass
      setNewItems(itemsToAdd)

      // Schedule the update to renderedIds *after* the current render pass.
      // This ensures Static gets `newItems` now, and the effect won't
      // re-process these items immediately in the next cycle.
      queueMicrotask(() => {
        setRenderedIds((prevIds) => {
          const updatedIds = new Set(prevIds)
          itemsToAdd.forEach((item) => updatedIds.add(item.id))
          return updatedIds
        })
        // Allow subsequent updates
        isUpdatingRef.current = false
      })
    } else if (newItems.length > 0) {
      // If there are no new items to add, but we previously had some (in newItems state),
      // clear the state for the next render.
      setNewItems([])
    }
    // Dependencies: Run when the source items change, or when renderedIds change.
    // Include newItems.length to ensure cleanup runs if items list shrinks back.
  }, [items, renderedIds, newItems.length])

  // Return only the newly identified items for Static to render
  return newItems
}
