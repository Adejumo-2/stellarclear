#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " StellarClear Pre-Release Readiness Verification Pipeline"
echo "=========================================================="

echo "[1/7] Verifying Node.js environment..."
node_version=$(node -v)
echo "  Node version: $node_version"

echo "[2/7] Compiling all packages and services..."
npm run build

echo "[3/7] Running TypeScript strict typechecks..."
npm run typecheck

echo "[4/7] Running unit test suites..."
npm run test:unit

echo "[5/7] Running API endpoint and lifecycle test suites..."
npm run test:api

echo "[6/7] Running indexer and state synchronization test suites..."
npm run test:indexer

echo "[7/7] Running end-to-end and live Soroban integration suites..."
npm run test:integration

echo "=========================================================="
echo " All release readiness checks passed successfully! (100%)"
echo "=========================================================="
