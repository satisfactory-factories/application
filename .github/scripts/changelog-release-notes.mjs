#!/usr/bin/env node

// Pulls one release's section out of CHANGELOG.md so the release workflow can
// publish it verbatim as a GitHub release body.
//
// CHANGELOG.md is the source of truth for what shipped, and it is written for
// humans rather than generated from commits. Rendering it twice — once in the
// in-app Change Log, once on the GitHub release — beats maintaining a second set
// of notes that drifts from the first.
//
// A release is a `## ` heading naming its version, e.g.
//
//   ## Beta v0.6 - The "Groundwork" Update
//
// and runs until the next `## ` heading or the end of the file. A heading naming
// the exact version wins; failing that, the version's major.minor does, so
// `0.6.0` finds `v0.6`. The changelog titles releases the way the app does
// ("Beta v0.6") while tags carry the full package version, and that fallback is
// what bridges the two.
//
// Usage:
//   node .github/scripts/changelog-release-notes.mjs --version 0.6.0 [--out notes.md]
//   node .github/scripts/changelog-release-notes.mjs --list
//
// The release body goes to --out, and a JSON blob of metadata always goes to
// stdout for the workflow to read with jq. --print echoes the body to stderr,
// which keeps it out of that JSON while still letting you read it.

import { readFileSync, writeFileSync } from 'node:fs'

// GitHub rejects a release body over 125,000 characters. Fail here with a clear
// reason rather than letting the API return an opaque 422 half way through a
// release.
const MAX_BODY_LENGTH = 125_000

function parseArgs (argv) {
  const args = { changelog: 'CHANGELOG.md' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--version': args.version = argv[++i]; break
      case '--changelog': args.changelog = argv[++i]; break
      case '--out': args.out = argv[++i]; break
      case '--list': args.list = true; break
      case '--print': args.print = true; break
      default: throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

// Splits the changelog on its `## ` headings. Fenced code blocks are skipped so
// a `## ` inside one is never mistaken for a release heading.
export function parseSections (markdown) {
  const sections = []
  let current = null
  let inFence = false

  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence

    const heading = !inFence && /^## +(.*\S)\s*$/.exec(line)
    if (heading) {
      current = { title: heading[1], lines: [] }
      sections.push(current)
      continue
    }

    current?.lines.push(line)
  }

  return sections.map(({ title, lines }) => ({ title, body: lines.join('\n').trim() }))
}

// `0.6.0` -> `0.6`. Also accepts `v0.6` and `Beta v0.6` so the script stays
// usable by hand, even though the workflow always passes a full x.y.z version.
export function majorMinor (version) {
  const match = /(\d+)\.(\d+)/.exec(version ?? '')
  if (!match) throw new Error(`Could not read a major.minor version out of "${version}"`)
  return `${match[1]}.${match[2]}`
}

// `0.6.0` -> `0.6.0`, or null if the version was not given in full.
function fullVersion (version) {
  return /\d+\.\d+\.\d+/.exec(version ?? '')?.[0] ?? null
}

// Matches `0.6` in a title but not `0.60` or `0.6.1`, with or without the `v`.
function matchOn (sections, token) {
  if (!token) return []
  const escaped = token.replaceAll('.', String.raw`\.`)
  const pattern = new RegExp(String.raw`(?<![\w.])v?${escaped}(?![\d.])`)
  return sections.filter(section => pattern.test(section.title))
}

// A patch release that has been given its own heading wins; otherwise the
// minor's section is the one describing it, since the changelog titles releases
// the way the app does. Without the first pass, releasing 0.6.1 would quietly
// republish the v0.6 notes even where a v0.6.1 section exists.
export function findSection (sections, version) {
  const exact = matchOn(sections, fullVersion(version))
  return exact.length > 0 ? exact : matchOn(sections, majorMinor(version))
}

// Alpha and Beta releases are pre-releases. Every release so far is one, but the
// day 1.0 ships this stops marking it.
export function isPrerelease (title) {
  return /^\s*(alpha|beta|rc\b|release candidate)/i.test(title)
}

function main () {
  const args = parseArgs(process.argv.slice(2))
  const sections = parseSections(readFileSync(args.changelog, 'utf8'))

  if (args.list) {
    for (const section of sections) console.log(section.title)
    return
  }

  if (!args.version) throw new Error('--version is required (e.g. --version 0.6.0)')

  const matches = findSection(sections, args.version)
  const known = sections.map(section => `  - ${section.title}`).join('\n')

  if (matches.length === 0) {
    throw new Error(
      `No section in ${args.changelog} names version ${majorMinor(args.version)}.\n` +
      `Releases the changelog knows about:\n${known}\n` +
      'Add a section for it before releasing, or correct the version.'
    )
  }

  if (matches.length > 1) {
    throw new Error(
      `${matches.length} sections in ${args.changelog} name version ${majorMinor(args.version)}:\n` +
      matches.map(match => `  - ${match.title}`).join('\n') +
      '\nOnly one heading may claim a version.'
    )
  }

  const [{ title, body }] = matches

  if (body.length === 0) throw new Error(`The "${title}" section is empty; there is nothing to release.`)
  if (body.length > MAX_BODY_LENGTH) {
    throw new Error(
      `The "${title}" section is ${body.length} characters; GitHub caps a release body at ${MAX_BODY_LENGTH}.`
    )
  }

  if (args.out) writeFileSync(args.out, `${body}\n`)
  if (args.print) process.stderr.write(`${body}\n`)

  console.log(JSON.stringify({
    title,
    version: args.version,
    prerelease: isPrerelease(title),
    characters: body.length,
  }))
}

// Only run when invoked directly, so the parsing helpers stay importable.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
