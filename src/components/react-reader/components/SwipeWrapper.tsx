import { type ReactNode } from 'react'
import { type SwipeableProps, useSwipeable } from 'react-swipeable'

// Props for the swipe gesture wrapper component
export type SwipeWrapperProps = {
  children: ReactNode
  swipeProps: Partial<SwipeableProps>
}

/**
 * SwipeWrapper Component
 * Wraps the reader with touch gesture support for mobile/tablet navigation
 * Enables swiping left/right to turn pages
 */
export const SwipeWrapper = ({ children, swipeProps }: SwipeWrapperProps) => {
  const handlers = useSwipeable(swipeProps)
  return (
    <div style={{ height: '100%' }} {...handlers}>
      {children}
    </div>
  )
}
