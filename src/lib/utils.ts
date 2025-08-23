// Purpose: Misc small utilities. Keep tiny and readable.

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
