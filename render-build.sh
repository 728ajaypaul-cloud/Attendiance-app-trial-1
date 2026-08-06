#!/usr/bin/env bash
set -e

echo "=== Building frontend ==="
cd frontend
npm install
npm run build
echo "=== Copying frontend build to backend/public ==="
rm -rf ../backend/public
cp -r build ../backend/public
cd ..

echo "=== Installing backend dependencies ==="
cd backend
npm install
echo "=== Rebuilding native addons (better-sqlite3) ==="
npm rebuild better-sqlite3
cd ..

echo "=== Build complete ==="
