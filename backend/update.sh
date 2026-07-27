#!/usr/bin/env bash
#
# Runs ON THE API BOX (sf / 10.0.5.5) as /root/update.sh. The webhooks server
# SSHes in and executes it; it is the last step of the deploy chain:
#
#   merge to main -> Backend: Deploy -> Docker Hub -> webhook -> here
#
# This file is the source of truth, but NOTHING SYNCS IT. When it changes, copy
# it to the box by hand:
#
#   scp backend/update.sh sf:/root/update.sh && ssh sf 'chmod 755 /root/update.sh'
#
# This script is the ONLY place in the whole chain that can detect a failed
# deploy. The webhook returns 200 before the SSH even happens, and the webhooks
# server does not report the remote exit code, so if this script does not write
# the failure down, nothing anywhere does. That is why it is this defensive for
# something that is morally three docker commands.
#
# See docs/deployment.md ("What was wrong with the old update.sh") for the full
# list of failure modes this replaces.
#
set -euo pipefail

LOG=/root/deploy.log
COMPOSE_DIR=/root/docker
SERVICE=backend
CONTAINER=sf-backend
LOCK=/var/lock/sf-deploy.lock
LOCK_WAIT=600

# tee, not `>>`: the compose commands' own output goes to the same file as the
# progress lines. Previously the timestamps landed in deploy.log while the actual
# error text went to stdout, which is captured by the webhook daemon's log on a
# different machine — so diagnosing a failure meant correlating two logs on two
# boxes.
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

# The old script had no failure path at all. Under `set -e` a failed pull just
# ended the script, so deploy.log simply STOPPED mid-deploy — the last line was
# "Updating container...", which reads exactly like a truncated success. Worse,
# the failure could land between `down` and `up`, leaving the API off with no
# record of why.
fail() {
  local code=$?
  log "DEPLOY FAILED (exit $code) at line $1."
  log "  The API may be stopped. Check: docker compose -f $COMPOSE_DIR/docker-compose.yml ps $SERVICE"
  exit "$code"
}
trap 'fail $LINENO' ERR

# Nothing serialises deploys. The GitHub concurrency group only orders runs from
# one repo — it cannot stop a workflow deploy from colliding with someone running
# publish.sh by hand, and two overlapping pull/recreate cycles can leave the
# service stopped.
exec 9>"$LOCK"
if ! flock -w "$LOCK_WAIT" 9; then
  log "Another deploy has held the lock for ${LOCK_WAIT}s — giving up rather than racing it."
  exit 1
fi

cd "$COMPOSE_DIR" || { log "FATAL: $COMPOSE_DIR does not exist."; exit 1; }

log "Deploy requested."

before=$(docker compose images -q "$SERVICE" 2>/dev/null || true)

log "Pulling $SERVICE image..."
# --quiet suppresses the per-layer progress, which is what tee was dumping into
# deploy.log: the first real deploy wrote ~80 lines of "Extracting 24.31MB" into
# the one file you are meant to be able to read at a glance. Errors still print
# and are still captured, which is the reason tee is here at all.
docker compose pull --quiet "$SERVICE" 2>&1 | tee -a "$LOG"

# `up -d` recreates the container only when the image digest actually changed, so
# a no-op deploy costs nothing and never drops a request. The old script ran
# `down backend && up backend -d`, which tore the API down on EVERY call — about
# ten seconds of 502s per deploy (ts-node compiles on boot), including for the
# many calls where the pull changed nothing at all.
#
# --wait blocks until the healthcheck passes. Without it `up -d` returns as soon
# as the container is *started*, not when the app is listening: a container that
# boots and dies on a bad sf.env or an unreachable Mongo still exited 0, and with
# `restart: always` a crashlooping container looks indistinguishable from a
# healthy one.
log "Recreating $SERVICE if the image changed..."
docker compose up -d --wait "$SERVICE" 2>&1 | tee -a "$LOG"

after=$(docker compose images -q "$SERVICE" 2>/dev/null || true)

if [ -z "$after" ]; then
  log "DEPLOY FAILED: no image recorded for $SERVICE after up — is the service name right?"
  exit 1
fi

# The old script printed "Container updated!" unconditionally, whether or not the
# pull found anything. That single line is what hid the registry drift: the box
# was pulling a tag CI had stopped publishing to, reporting success every time,
# for months.
if [ "$before" = "$after" ]; then
  log "Image unchanged (${after:0:12}) — nothing new to deploy."
  log "  If you expected a change, the box is pulling a different tag from the one CI pushes."
else
  prev=${before:0:12}
  [ -n "$prev" ] || prev='(none)'
  log "Image updated: $prev -> ${after:0:12}"
fi

# Surfaces the case where this box's compose file has no healthcheck — `--wait`
# silently degrades to "is it running" then, which is most of the guarantee gone.
health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}NO HEALTHCHECK — --wait only checked the container is running{{end}}' "$CONTAINER" 2>/dev/null || echo 'unknown (container not found)')
log "Container state: $health"

# Every pull of a moving tag orphans the previous image. Dangling-only and older
# than a week, so tagged images — including the backend-<sha> tags a rollback
# needs, and anything belonging to other stacks on this box — are never touched.
# Best-effort: tidying up must not be able to fail a deploy that already worked.
docker image prune -f --filter 'until=168h' >/dev/null 2>&1 || true

log "Deployment finished!"
