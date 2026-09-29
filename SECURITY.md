# Security Policy

## Reporting Security Vulnerabilities

Please report security issues using **GitHub Private Vulnerability Reporting** (Security tab → Advisories → Report a vulnerability). Do not open public issues for vulnerabilities.

Include reproduction steps, environment, and impact.

## Security Status

> **UNAUDITED CODE**: This repo is under active development and has not undergone a formal third-party audit. Do not use with real funds in production without prior audit. On-chain layer: see `stellarclear-contract/SECURITY.md`.

## Scope

- Reconciliation logic bypasses in `services/matcher`
- Proof/commitment forgery in `packages/proof`
- Auth/validation flaws in `services/api`
- Unsafe handling of Stellar transaction references in `services/indexer`

Out of scope: toolchain bugs, social engineering, off-chain infrastructure outside this repo.
