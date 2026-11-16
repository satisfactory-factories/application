/**
 * The outage that left edits unsaved with nothing on screen: the API process and its socket stay
 * up, `/health` answers 503, and every query waits on a database that never replies. Stopping
 * mongod rather than killing it is what reproduces that. A killed one refuses connections, which
 * the driver notices and fails fast on; a stopped one holds every connection open and silent.
 *
 * Safe only because the suite runs one worker: every other test shares this mongod.
 */
const mongodPid = (): number => {
  const pid = Number(process.env.E2E_MONGOD_PID)
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('global-setup did not record the mongod pid')
  return pid
}

/** Freezes the database, and returns the thaw. Call the thaw in a `finally`. */
export const freezeDatabase = (): (() => void) => {
  const pid = mongodPid()
  process.kill(pid, 'SIGSTOP')
  let thawed = false
  return () => {
    if (thawed) return
    thawed = true
    process.kill(pid, 'SIGCONT')
  }
}
