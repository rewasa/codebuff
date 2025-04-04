import React, { useState, useEffect, useRef } from 'react'

type ItemWithId = { id: string; [key: string]: any }

/**
 * A hook to manage appending items statically, similar to Ink's <Static>.
 * It takes the full list of items and a render function, identifies new items,
 * renders them, and returns an array containing only the newly rendered elements.
 *
 * @param items The full list of items (must have unique `id` properties).
 * @param children A function that takes an item and returns the React element to render for it.
 * @returns An array React element containing the newly rendered items, or null if no new items.
 */
export function useStaticMessages<T extends ItemWithId>(
  items: T[],
  children: (item: T) => React.ReactElement // Function to render each item
): React.ReactElement[] | null { // Return type is array of elements or null
  const [renderedIds, setRenderedIds] = useState(() => new Set<string>())
  // Store the rendered elements for the new items
  const [newElements, setNewElements] = useState<React.ReactElement[]>([])
  const isUpdatingRef = useRef(false)

  useEffect(() => {
    if (isUpdatingRef.current) return

    const itemsToAdd = items.filter((item) => !renderedIds.has(item.id))

    if (itemsToAdd.length > 0) {
      isUpdatingRef.current = true
      // Map new items to their rendered elements using the children function
      const elementsToAdd = itemsToAdd.map((item) => children(item))
      setNewElements(elementsToAdd) // Set the elements state

      queueMicrotask(() => {
        setRenderedIds((prevIds) => {
          const updatedIds = new Set(prevIds)
          itemsToAdd.forEach((item) => updatedIds.add(item.id))
          return updatedIds
        })
        isUpdatingRef.current = false
      })
    } else if (newElements.length > 0) {
      // Clear if no new items but state still holds old elements
      setNewElements([])
    }
  }, [items, children, renderedIds, newElements.length])

  // Return the array of new elements, or null if none
  if (newElements.length === 0) {
    return null
  }

  return newElements // Return the array directly
}
