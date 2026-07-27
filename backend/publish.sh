#!/usr/bin/env bash
#
# BREAK GLASS ONLY.
#
# The normal way to ship the API is to merge to main: the "Backend: Deploy"
# workflow runs the checks, builds and pushes the image, and pokes the webhook
# that redeploys the box. See docs/deployment.md.
#
# Use this when GitHub Actions is unavailable, or when you need to put something
# on the box that is not on main. It skips every check, and it publishes
# backend-latest without a matching backend-<sha> tag, so what is running in
# production stops being traceable to a commit until the next real deploy.
#
set -euo pipefail

IMAGE=maelstromeous/satisfactory-factories:backend-latest

# The image builds from the workspace root, not from backend/ — the `catalog:`
# versions in backend/package.json need pnpm-workspace.yaml in the build context.
cd "$(dirname "$0")/.."

echo "Building $IMAGE from $(pwd)..."
docker build --platform linux/amd64 -f backend/Dockerfile -t "$IMAGE" .

echo "Pushing $IMAGE..."
docker push "$IMAGE"

echo "Triggering /root/update.sh on sf..."
ssh sf '/root/update.sh'
