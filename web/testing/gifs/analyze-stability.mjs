// Objective jiggle detector. For every consecutive frame pair, finds the (dx, dy) shift that
// best aligns them by cross-correlating row/column brightness profiles. A pure content change
// (a digit ticking over, a group appearing) leaves the best shift at 0; a frame that has
// *translated* shows a non-zero best shift. Prints every frame where the content moved.
import { execSync } from 'child_process'
import fs from 'fs'

const dir = process.argv[2]
const MAXSHIFT = 24
const files = fs.readdirSync(dir).filter(f => /^frame_\d+\.png$/.test(f)).sort()
if (!files.length) { console.error(`no frames in ${dir}`); process.exit(1) }

// Decode each frame to a small 8-bit grayscale buffer via ffmpeg; W/H kept modest so the
// correlation is cheap but still well above the shift magnitudes we care about.
const W = 320; const H = 320
const load = file => {
  const raw = execSync(
    `ffmpeg -v error -i "${dir}/${file}" -vf "format=gray,scale=${W}:${H}:flags=bilinear" -f rawvideo -pix_fmt gray -`,
    { maxBuffer: 1 << 28, encoding: 'buffer' },
  )
  return raw
}

// Mean brightness per row and per column: a 2-D translation shows up as a 1-D shift in both.
const profiles = buf => {
  const rows = new Float64Array(H)
  const cols = new Float64Array(W)
  for (let y = 0; y < H; y++) {
    let s = 0
    for (let x = 0; x < W; x++) { const v = buf[y * W + x]; s += v; cols[x] += v }
    rows[y] = s / W
  }
  for (let x = 0; x < W; x++) cols[x] /= H
  return { rows, cols }
}

// Best integer shift of `b` relative to `a`, by minimum mean absolute difference over overlap.
const bestShift = (a, b, n) => {
  let best = 0; let bestErr = Infinity
  for (let s = -MAXSHIFT; s <= MAXSHIFT; s++) {
    let err = 0; let cnt = 0
    for (let i = 0; i < n; i++) {
      const j = i + s
      if (j < 0 || j >= n) continue
      err += Math.abs(a[i] - b[j]); cnt++
    }
    if (cnt < n * 0.6) continue
    err /= cnt
    if (err < bestErr - 1e-9) { bestErr = err; best = s }
  }
  // Confidence: how much better the best shift is than staying put. A tiny margin means the
  // "shift" is just noise on a frame whose content genuinely changed, not a real translation.
  let zeroErr = 0; let zc = 0
  for (let i = 0; i < n; i++) { zeroErr += Math.abs(a[i] - b[i]); zc++ }
  zeroErr /= zc
  return { shift: best, err: bestErr, zeroErr }
}

let prev = profiles(load(files[0]))
const moves = []
for (let i = 1; i < files.length; i++) {
  const cur = profiles(load(files[i]))
  const v = bestShift(prev.rows, cur.rows, H)
  const h = bestShift(prev.cols, cur.cols, W)
  // Only count as a real translation when aligning at the shift is clearly better than not.
  const vMoved = v.shift !== 0 && v.zeroErr - v.err > 0.5
  const hMoved = h.shift !== 0 && h.zeroErr - h.err > 0.5
  if (vMoved || hMoved) {
    moves.push({ frame: files[i], dy: vMoved ? v.shift : 0, dx: hMoved ? h.shift : 0, vGain: +(v.zeroErr - v.err).toFixed(2), hGain: +(h.zeroErr - h.err).toFixed(2) })
  }
  prev = cur
}

console.log(`${dir}: ${files.length} frames, ${moves.length} translated`)
for (const m of moves) console.log(`  ${m.frame}  dy=${m.dy} (gain ${m.vGain})  dx=${m.dx} (gain ${m.hGain})`)
