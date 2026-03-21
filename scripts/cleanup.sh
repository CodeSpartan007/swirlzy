#!/bin/bash

# Remove node_modules directory
if [ -d "node_modules" ]; then
  echo "Removing node_modules..."
  rm -rf node_modules
  echo "node_modules removed"
fi

# Remove pnpm lockfile
if [ -f "pnpm-lock.yaml" ]; then
  echo "Removing pnpm-lock.yaml..."
  rm pnpm-lock.yaml
  echo "pnpm-lock.yaml removed"
fi

echo "Cleanup complete. Dependencies ready for clean reinstall."
