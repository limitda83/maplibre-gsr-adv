#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"

cd "$ROOT_DIR"
npm install
npm run example
