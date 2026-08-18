import { describe, expect, it } from 'vitest'
import { safeHtml } from '@/utils/safeHtml'

// Every `<` left in the output must be the start of an allowed, attribute-less tag. Asserting on
// the word "onerror" would pass on escaped text that merely mentions it, which proves nothing.
const ONLY_ALLOWED_TAGS = /<(?!\/?(?:br|b|i|u|em|strong|ul|ol|li|small)>)/

describe('safeHtml', () => {
  it('keeps the formatting tags the tooltips actually use', () => {
    expect(safeHtml('Not enough of an item.<br><b>Iron Ore</b>'))
      .toBe('Not enough of an item.<br><b>Iron Ore</b>')
    expect(safeHtml('<ul><li>one</li><li>two</li></ul>'))
      .toBe('<ul><li>one</li><li>two</li></ul>')
    expect(safeHtml('a<br/>b')).toBe('a<br>b')
  })

  // The reported injection: a share link controls the part id, and an unknown id is echoed back
  // verbatim by getPartDisplayName as "UNKNOWN PART <id>!".
  it('defuses a script payload smuggled in through a part id', () => {
    const out = safeHtml('UNKNOWN PART <img src=x onerror="steal(localStorage.token)">!')

    expect(out).not.toMatch(ONLY_ALLOWED_TAGS)
    expect(out).toContain('&lt;img')
  })

  it('does not restore attributes on an allowed tag', () => {
    const out = safeHtml('<b onmouseover="alert(1)">x</b>')

    expect(out).not.toMatch(ONLY_ALLOWED_TAGS)
    expect(out).toContain('&lt;b onmouseover=')
  })

  it('escapes a bare ampersand', () => {
    expect(safeHtml('Fuel & Water')).toBe('Fuel &amp; Water')
  })

  it('does not let a pre-escaped entity smuggle a tag back in', () => {
    expect(safeHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).not.toMatch(ONLY_ALLOWED_TAGS)
  })

  it('handles null and undefined', () => {
    expect(safeHtml(null)).toBe('')
    expect(safeHtml(undefined)).toBe('')
  })
})
