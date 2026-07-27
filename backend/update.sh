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
set -euo pipefail

LOG=/root/deploy.log
COMPOSE_DIR=/root/docker

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

# Anything that kills the script — a failed pull, a container that never turns
# healthy — leaves a line saying so, instead of a log that just stops mid-deploy.
trap 'log "DEPLOY FAILED (exit $?) — the API may still be on the previous image."' ERR

cd "$COMPOSE_DIR"

log "Deploy requested."

before=$(docker compose images -q backend 2>/dev/null || true)

log "Pulling backend image..."
docker compose pull backend

# `up -d` recreates the container only when the image digest actually changed, so
# a no-op deploy costs nothing and never drops a request. This used to be
# `down backend && up backend -d`, which took the API offline on every call even
# when the pull changed nothing.
#
# --wait blocks until the healthcheck in the compose file passes. Without it a
# container that boots and immediately dies still exits 0 here, and the whole
# chain reports success — the webhook returns 200 regardless, so this is the only
# place that can catch it.
log "Recreating backend container..."
docker compose up -d --wait backend

after=$(docker compose images -q backend 2>/dev/null || true)

if [ "$before" = "$after" ]; then
  log "Image unchanged (${after:0:12}) — container is healthy, nothing to deploy."
else
  log "Image updated: ${before:0:12} -> ${after:0:12}"
fi

log "Deployment finished!"
