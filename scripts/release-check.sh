#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " StellarClear Pre-Release Readiness Verification Pipeline"
echo "=========================================================="

echo "[1/8] Verifying Node.js environment..."
node_version=$(node -v)
echo "  Node version: $node_version"

echo "[2/8] Compiling all packages and services..."
npm run build

echo "[3/8] Running TypeScript strict typechecks..."
npm run typecheck

echo "[4/8] Running unit and contract release test suites..."
npm run test:unit

echo "[5/8] Running API endpoint and operations diagnostic test suites..."
npm run test:api

echo "[6/8] Running security and replay hardening regression suites..."
npm run test:security

echo "[7/8] Running indexer and state synchronization test suites..."
npm run test:indexer

echo "[8/8] Running end-to-end and live Soroban integration suites..."
npm run test:integration

echo "=========================================================="
echo " All release readiness checks passed successfully! (100%)"
echo "=========================================================="
