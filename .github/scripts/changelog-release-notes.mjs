#!/usr/bin/env node

// Turns one release of the in-app Change Log into markdown, so the release
// workflow can publish it as a GitHub release body.
//
// The source is the page players actually read, web/src/pages/changelog.vue,
// rather than CHANGELOG.md. The two describe the same updates at very different
// altitudes: CHANGELOG.md is the exhaustive technical record, paragraphs deep in
// implementation detail, which reads as noise to someone who just wants to know
// what is new. The in-app page is the written-for-players version — short
// sections, screenshots, a key of 🆕 / 👍 / 🔧 — and that is what a release
// should say.
//
// A release is an `<h1>` naming its version, e.g.
//
//   <h1>Beta v0.6 - The "Groundwork" Update <span class="release-date">19/Aug/2026</span></h1>
//
// and runs until the next `<h1>`. A heading naming the exact version wins;
// failing that, the version's major.minor does, so `0.6.0` finds `v0.6`.
//
// Usage:
//   node .github/scripts/changelog-release-notes.mjs --version 0.6.0 [--out notes.md]
//   node .github/scripts/changelog-release-notes.mjs --list
//
// The body goes to --out and a JSON blob of metadata to stdout for the workflow
// to read with jq. --print echoes the body to stderr, keeping it out of the JSON.

import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'web/src/pages/changelog.vue'

// Screenshots are written as site-absolute paths for the app to serve. A release
// is read on github.com, so they have to be pointed back at the live site.
const SITE = 'https://satisfactory-factories.app'

// GitHub rejects a release body over 125,000 characters. Fail here with a clear
// reason rather than letting the API return an opaque 422 mid-release.
const MAX_BODY_LENGTH = 125_000

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

// Tags that carry no content of their own.
const VOID_TAGS = new Set(['br', 'hr', 'img', 'source', 'v-img', 'v-divider', 'game-asset', 'youtube-embed'])

// Layout and decoration that a release body has no use for. Dropped whole,
// children included.
const DROPPED = new Set(['nav', 'v-divider', 'game-asset', 'introduction', 'style', 'script'])

// Passed through, contributing only their children.
const TRANSPARENT = new Set(['v-container', 'v-row', 'v-col', 'template', 'div', 'span', 'small'])

function decode (text) {
  return text.replace(/&(#?\w+);/g, (whole, name) => ENTITIES[name] ?? whole)
}

// Finds the `>` closing a tag, ignoring any inside a quoted attribute value.
function tagEnd (html, start) {
  let quote = null
  for (let i = start + 1; i < html.length; i++) {
    const char = html[i]
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return i
    }
  }
  throw new Error(`Unterminated tag at offset ${start}`)
}

function parseAttrs (source) {
  const attrs = {}
  for (const [, name, value] of source.matchAll(/([:@]?[\w.-]+)(?:\s*=\s*"([^"]*)")?/g)) {
    attrs[name] = decode(value ?? '')
  }
  return attrs
}

// A tolerant tag-soup parser. The input is a linted Vue template rather than
// arbitrary HTML, so it only has to cope with well-formed markup — but it fails
// loudly rather than guessing when it meets something it does not know.
export function parse (html) {
  const root = { tag: null, children: [] }
  const stack = [root]
  let i = 0

  const push = node => stack.at(-1).children.push(node)

  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      push({ text: html.slice(i) })
      break
    }
    if (lt > i) push({ text: html.slice(i, lt) })

    if (html.startsWith('<!--', lt)) {
      i = html.indexOf('-->', lt) + 3
      continue
    }

    const gt = tagEnd(html, lt)
    const raw = html.slice(lt + 1, gt).trim()
    i = gt + 1

    if (raw.startsWith('/')) {
      const tag = raw.slice(1).trim().toLowerCase()
      // Find the matching open tag, tolerating unclosed inline elements.
      const depth = stack.findLastIndex(node => node.tag === tag)
      if (depth > 0) stack.length = depth
      continue
    }

    const selfClosing = raw.endsWith('/')
    const body = selfClosing ? raw.slice(0, -1) : raw
    const tag = body.match(/^[\w-]+/)?.[0]?.toLowerCase()
    if (!tag) throw new Error(`Could not read a tag name from "<${raw}>"`)

    const node = { tag, attrs: parseAttrs(body.slice(tag.length)), children: [] }
    push(node)
    if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(node)
  }

  return root
}

const isText = node => typeof node.text === 'string'

// Collapses runs of whitespace the way HTML rendering does, so the source's
// indentation never reaches the markdown.
// Headings and chips space their parts with Vuetify margin utilities rather than
// whitespace (`<span class="ml-2">Overclocking</span><span class="mx-2">&</span>`),
// so concatenating the text alone would run the words together.
const LEADING_SPACE = /\b(?:ml|ms|mx)-\d/
const TRAILING_SPACE = /\b(?:mr|me|mx)-\d/

function inline (nodes) {
  let out = ''

  const append = (node, piece) => {
    if (!piece) return
    const classes = node.attrs?.class ?? ''
    if (LEADING_SPACE.test(classes) && out && !/\s$/.test(out)) out += ' '
    out += piece
    if (TRAILING_SPACE.test(classes)) out += ' '
  }

  for (const node of nodes) {
    if (isText(node)) {
      out += decode(node.text).replace(/\s+/g, ' ')
      continue
    }
    if (DROPPED.has(node.tag)) continue

    switch (node.tag) {
      case 'b': case 'strong': {
        const text = inline(node.children).trim()
        append(node, text && `**${text}**`)
        break
      }
      case 'em': {
        const text = inline(node.children).trim()
        append(node, text && `_${text}_`)
        break
      }
      case 'i': {
        // Font Awesome icons are empty <i> elements; only a real one has text.
        const text = inline(node.children).trim()
        append(node, text && `_${text}_`)
        break
      }
      case 'code': append(node, `\`${inline(node.children).trim()}\``); break
      case 'a': {
        const text = inline(node.children).trim()
        const href = node.attrs.href
        append(node, href ? `[${text}](${href})` : text)
        break
      }
      // A chip is a visually distinct label in the app; bold is the nearest
      // thing markdown has.
      case 'v-chip': {
        const text = inline(node.children).trim()
        append(node, text && `**${text}**`)
        break
      }
      case 'br': out += '\n'; break
      default:
        if (!TRANSPARENT.has(node.tag)) throw new Error(`No inline rule for <${node.tag}>`)
        append(node, inline(node.children))
    }
  }

  // Collapse the doubles those inserted spaces can create, without touching the
  // newlines a <br> contributes.
  return out.replace(/[^\S\n]+/g, ' ')
}

function asset (src) {
  return src.startsWith('/') ? `${SITE}${src}` : src
}

// "loading.mp4" -> "Loading". Videos carry no alt text, so the filename is the
// only description there is.
function labelFor (src) {
  const stem = src.split('/').pop().replace(/\.\w+$/, '').replaceAll('-', ' ')
  return stem.charAt(0).toUpperCase() + stem.slice(1)
}

// Returns an array of markdown blocks. Block-level nodes render themselves;
// stray inline content is gathered into a paragraph.
function blocks (nodes) {
  const out = []
  let pending = ''

  const flush = () => {
    const text = pending.trim()
    if (text) out.push(text)
    pending = ''
  }

  for (const node of nodes) {
    if (isText(node)) { pending += decode(node.text).replace(/\s+/g, ' '); continue }
    if (DROPPED.has(node.tag)) continue

    switch (node.tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': {
        flush()
        const level = '#'.repeat(Number(node.tag[1]))
        const text = inline(node.children).replace(/\s+/g, ' ').trim()
        if (text) out.push(`${level} ${text}`)
        break
      }
      case 'p': {
        flush()
        const text = inline(node.children).trim()
        if (text) out.push(text)
        break
      }
      case 'ul': case 'ol': {
        flush()
        out.push(list(node, ''))
        break
      }
      case 'v-img': case 'img': {
        flush()
        const src = node.attrs.src
        if (src) out.push(`![${node.attrs.alt ?? ''}](${asset(src)})`)
        break
      }
      case 'video': {
        flush()
        // The text inside a <video> is "your browser does not support…"
        // fallback, so only the <source> matters. mp4s on another origin do not
        // embed on github.com, so it becomes a link.
        const src = node.children.find(child => child.tag === 'source')?.attrs?.src
        if (src) out.push(`[▶ Watch: ${labelFor(src)}](${asset(src)})`)
        break
      }
      case 'youtube-embed': {
        flush()
        const id = node.attrs['video-id']
        if (id) out.push(`[▶ Watch the update video](https://www.youtube.com/watch?v=${id})`)
        break
      }
      default: {
        if (TRANSPARENT.has(node.tag)) { flush(); out.push(...blocks(node.children)); break }
        pending += inline([node])
      }
    }
  }

  flush()
  return out.filter(Boolean)
}

// A list item can carry a screenshot or a nested list of its own. Those go on
// their own indented lines under the bullet — a 1200px screenshot inlined into
// the middle of a sentence is unreadable.
const BLOCK_IN_ITEM = new Set(['ul', 'ol', 'p', 'v-img', 'img', 'video', 'youtube-embed'])

function list (node, indent) {
  const ordered = node.tag === 'ol'
  const items = node.children.filter(child => child.tag === 'li')
  const pad = `${indent}  `

  return items.map((item, index) => {
    const marker = ordered ? `${index + 1}.` : '-'
    const nested = item.children.filter(child => BLOCK_IN_ITEM.has(child.tag))
    const rest = item.children.filter(child => !nested.includes(child))
    const text = inline(rest).replace(/\s+/g, ' ').trim()

    let out = `${indent}${marker} ${text}`
    for (const child of nested) {
      // A nested list hangs directly off its parent item; a blank line before it
      // would loosen the whole list. Anything else needs one to be a block.
      out += (child.tag === 'ul' || child.tag === 'ol')
        ? `\n${list(child, pad)}`
        : `\n\n${blocks([child]).map(block => pad + block).join(`\n\n${pad}`)}`
    }
    return out
  }).join('\n')
}

// Splits the page into releases: each <h1> that names one, plus everything up to
// the next <h1>. The "Change Log" heading is the page title, not a release.
export function parseReleases (source) {
  const start = source.indexOf('<template>')
  const end = source.lastIndexOf('</template>')
  if (start === -1 || end === -1) throw new Error(`No <template> block found in ${SOURCE}`)

  const tree = parse(source.slice(start + '<template>'.length, end))

  // The releases sit inside the layout wrappers, so flatten those away first.
  const flatten = nodes => nodes.flatMap(node =>
    !isText(node) && TRANSPARENT.has(node.tag) && node.tag !== 'span' ? flatten(node.children) : [node])

  const releases = []
  for (const node of flatten(tree.children)) {
    if (node.tag === 'h1') {
      const dateNode = node.children.find(child => child.attrs?.class?.includes('release-date'))
      const date = dateNode ? inline(dateNode.children).trim() : ''
      const title = inline(node.children.filter(child => child !== dateNode)).replace(/\s+/g, ' ').trim()
      if (!title || title === 'Change Log') { releases.push(null); continue }
      releases.push({ title, date, nodes: [] })
      continue
    }
    releases.at(-1)?.nodes?.push(node)
  }

  return releases.filter(Boolean)
}

export function toMarkdown (release) {
  const body = blocks(release.nodes).join('\n\n')
  return release.date ? `_Released ${release.date}._\n\n${body}` : body
}

export function majorMinor (version) {
  const match = /(\d+)\.(\d+)/.exec(version ?? '')
  if (!match) throw new Error(`Could not read a major.minor version out of "${version}"`)
  return `${match[1]}.${match[2]}`
}

function fullVersion (version) {
  return /\d+\.\d+\.\d+/.exec(version ?? '')?.[0] ?? null
}

// Matches `0.6` in a title but not `0.60` or `0.6.1`, with or without the `v`.
function matchOn (releases, token) {
  if (!token) return []
  const escaped = token.replaceAll('.', String.raw`\.`)
  const pattern = new RegExp(String.raw`(?<![\w.])v?${escaped}(?![\d.])`)
  return releases.filter(release => pattern.test(release.title))
}

// A patch release given its own heading wins; otherwise the minor's section is
// the one describing it, since the page titles releases the way the app does.
export function findRelease (releases, version) {
  const exact = matchOn(releases, fullVersion(version))
  return exact.length > 0 ? exact : matchOn(releases, majorMinor(version))
}

function parseArgs (argv) {
  const args = { source: SOURCE }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--version': args.version = argv[++i]; break
      case '--source': args.source = argv[++i]; break
      case '--out': args.out = argv[++i]; break
      case '--list': args.list = true; break
      case '--print': args.print = true; break
      default: throw new Error(`Unknown argument: ${argv[i]}`)
    }
  }
  return args
}

function main () {
  const args = parseArgs(process.argv.slice(2))
  const releases = parseReleases(readFileSync(args.source, 'utf8'))

  if (args.list) {
    for (const release of releases) console.log(`${release.title}${release.date ? `  (${release.date})` : ''}`)
    return
  }

  if (!args.version) throw new Error('--version is required (e.g. --version 0.6.0)')

  const matches = findRelease(releases, args.version)
  const known = releases.map(release => `  - ${release.title}`).join('\n')

  if (matches.length === 0) {
    throw new Error(
      `No release in ${args.source} names version ${majorMinor(args.version)}.\n` +
      `Releases the Change Log knows about:\n${known}\n` +
      'Add it to the page before releasing, or correct the version.'
    )
  }

  if (matches.length > 1) {
    throw new Error(
      `${matches.length} releases in ${args.source} name version ${majorMinor(args.version)}:\n` +
      matches.map(match => `  - ${match.title}`).join('\n') +
      '\nOnly one heading may claim a version.'
    )
  }

  const [release] = matches
  const body = toMarkdown(release)

  // A conversion that quietly left markup or an unrendered Vue expression behind
  // would publish it to everyone, so neither is allowed through.
  const leftover = /<\/?[a-z][\w-]*[\s/>]|\{\{/i.exec(body)
  if (leftover) {
    throw new Error(`The converted notes still contain markup near: ${body.slice(Math.max(0, leftover.index - 60), leftover.index + 60)}`)
  }

  if (body.length === 0) throw new Error(`"${release.title}" converted to nothing; there is no release to publish.`)
  if (body.length > MAX_BODY_LENGTH) {
    throw new Error(`"${release.title}" is ${body.length} characters; GitHub caps a release body at ${MAX_BODY_LENGTH}.`)
  }

  if (args.out) writeFileSync(args.out, `${body}\n`)
  if (args.print) process.stderr.write(`${body}\n`)

  console.log(JSON.stringify({
    title: release.title,
    version: args.version,
    date: release.date,
    characters: body.length,
  }))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
