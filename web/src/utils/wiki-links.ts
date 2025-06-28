/**
 * Converts a part display name to a Satisfactory wiki URL
 * @param displayName The display name of the part (e.g., "AI Limiter")
 * @returns The wiki URL for the part
 */
export const getWikiUrl = (displayName: string): string => {
  if (!displayName) {
    return ''
  }

  // Convert display name to wiki format:
  // - Replace spaces with underscores
  // - Keep the original casing as wiki URLs are case-sensitive
  const wikiName = encodeURIComponent(displayName.replace(/\s+/g, '_'))

  return `https://satisfactory.wiki.gg/wiki/${wikiName}`
}
