// Purpose: Centralized error helpers to enforce beginner-friendly logging.

export function logError(msg: string, error: unknown) {
  // eslint-disable-next-line no-console
  console.error(`${msg}`, error)
}

export function toUserMessage(defaultMsg = 'Something went wrong') {
  // Smallest safe mapping for UI surfaces.
  return defaultMsg
}
