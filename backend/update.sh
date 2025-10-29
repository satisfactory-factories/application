#!/usr/bin/env bash
set -euo pipefail

echo "$(date '+%Y-%m-%d %H:%M:%S') Webhook called!" >> /root/deploy.log

cd /root/docker

echo "$(date '+%Y-%m-%d %H:%M:%S') Updating container..." >> /root/deploy.log
docker compose pull backend && docker compose down backend && docker compose up backend -d
echo "$(date '+%Y-%m-%d %H:%M:%S') Container updated!" >> /root/deploy.log