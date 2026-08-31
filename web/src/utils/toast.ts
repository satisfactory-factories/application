/**
 * The toast payload, shared by the event bus and the component that draws it.
 *
 * `plain` is the toast the planner has always shown: Vuetify's timeout, no bar.
 * `timed` drains a line along the bottom for as long as it has left, and
 * `permanent` waits to be dismissed. Issue #623 moves the rest onto those two.
 */
export type ToastType = 'info' | 'success' | 'warning' | 'error'

export type ToastVariant = 'plain' | 'timed' | 'permanent'

export interface ToastData {
  message: string
  type?: ToastType
  /** Ignored by a `permanent` toast. */
  timeout?: number
  variant?: ToastVariant
}
