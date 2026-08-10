#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/ubuntu/learn-sphere"

cd "$APP_DIR"
git fetch origin main
git checkout main
git pull --ff-only origin main
docker compose -f deploy/docker-compose.yml up --detach --build --remove-orphans
sleep 3
curl --fail --silent --show-error http://127.0.0.1:3100/api/health
printf '\nLearnSphere deployment completed.\n'
