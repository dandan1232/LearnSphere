#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/ubuntu/learn-sphere"

cd "$APP_DIR"
git fetch origin main
git checkout main
git pull --ff-only origin main
npm ci
npm run verify
sudo systemctl restart learnsphere
sleep 2
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
printf '\nLearnSphere deployment completed.\n'
