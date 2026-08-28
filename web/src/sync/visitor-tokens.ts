/**
 * Visitor tokens, kept per room. An anonymous joiner has no other credential, and
 * the server wants it re-sent on every join, so it has to outlive the page that
 * exchanged the password for it.
 */
export const VISITOR_TOKEN_KEY = 'roomVisitorTokens'

export type VisitorTokenMap = Record<string, string>

export const readVisitorTokens = (): VisitorTokenMap => {
  const raw = localStorage.getItem(VISITOR_TOKEN_KEY)
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}

  const map: VisitorTokenMap = {}
  for (const [roomId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string' && value !== '') map[roomId] = value
  }
  return map
}

export const readVisitorToken = (roomId: string): string | undefined =>
  readVisitorTokens()[roomId]

export const setVisitorToken = (roomId: string, token: string): void => {
  const map = readVisitorTokens()
  map[roomId] = token
  localStorage.setItem(VISITOR_TOKEN_KEY, JSON.stringify(map))
}

export const removeVisitorToken = (roomId: string): void => {
  const map = readVisitorTokens()
  if (!(roomId in map)) return
  delete map[roomId]
  localStorage.setItem(VISITOR_TOKEN_KEY, JSON.stringify(map))
}
