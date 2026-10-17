# StellarClear Monitoring Plan (Builders)

**Status:** Living document — v0.1.1, last reviewed 2026-10-08.
**Source:** Derived from the [Threat Model (STRIDE)](./threat-model.md); threat identifiers are carried over unchanged so every monitor traces back to a known threat, per the [On-Chain Monitoring Plan Template (Builders)](https://developers.stellar.org/docs/build/security-docs/monitoring/monitoring-template-builders).
**Handling note:** the upstream template recommends keeping completed plans internal. This document outlines monitoring policies, alerting thresholds, and operational responses for protocol services; it names monitors and thresholds but no secrets.

---

## 1. What are we monitoring?

StellarClear is a non-custodial settlement evidence and reconciliation protocol. It holds **no user funds** — the value at risk is the integrity of settlement evidence, finalization quorum, and service availability. This plan covers the on-chain contract, the off-chain services, and the boundaries between them.

| Component | On-chain address / endpoint | Notes |
| :--- | :--- | :--- |
| `SettlementRegistry` (v0.1.1 hardened) | `CCPCMPIUTKBLSJVSGPPSUHTBBY6HHT3OTE3CKUXC5BD2B3YEDSAROGC5` (Stellar Testnet) | Authoritative state anchor; admin + observer registry |
| `SettlementRegistry` (v0.1.0 prototype, historical) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | Superseded; monitored read-only for provenance |
| Soroban RPC | `https://soroban-testnet.stellar.org` (mainnet RPC at launch) | Ingestion dependency for the indexer |
| REST API | `:3000/v1/*` | Case ingestion, proofs, health probes |
| Indexer | RPC event stream → PostgreSQL | Cursor checkpoints, WebSocket stream `:3100/v1/events/stream` |
| PostgreSQL | internal only (never publicly mapped) | Indexed projection of chain state |

**Address discipline:** keep this table current. An out-of-date address list is the most common reason a monitor silently stops working — update it with every deploy.

---

## 2. What could go wrong? (threat register, carried over)

| Threat ID | Threat (from threat model) | Affected component | Severity |
| :--- | :--- | :--- | :--- |
| Info.2 | Credential leak via repository or CI | Repo, CI | Critical |
| Elev.1 | Compromised admin key manipulates observer registry | Contract | High |
| Elev.2 | Finalization with effectively single-observer quorum (default `quorum = 1`) | Contract | High |
| Spoof.1 | Stolen observer key submits false observation/match/break | Contract, observers | High |
| Spoof.2 / Repud.3 | Unauthenticated API actions, unattributable origin | API | High / Medium |
| DoS.2 | On-chain case state archived (TTL expiry) | Contract storage | High |
| Info.4 | Database/API exposed by misconfiguration | Deployment | Medium |
| Tamper.4 | Off-chain DB diverges from chain state | DB, indexer | Medium |
| DoS.1 | RPC outage/rate-limit stalls ingestion | Indexer | Medium |
| DoS.3 | Request floods / oversized payloads | API | Medium |
| Info.3 | Eavesdropping on WebSocket stream | Indexer WS | Medium |
| Elev.3 | Attestation from later-revoked observer still counts | Contract | Medium |
| Spoof.3 | Unauthorized WebSocket subscription | Indexer WS | Medium |
| Repud.1 / Repud.2 | Denial of on-chain actions | Contract | Low |
| Tamper.1 / Tamper.3 / Tamper.5 | State mutation, replay, artifact substitution | Contract, release | Low |
| Info.1 | Trade-term disclosure | Contract | Low |
| Elev.4 | Owner/counterparty counting as observer | Contract | Low |
| DoS.4 | Indefinite dispute stall | Contract | Low |
| Spoof.4 | UX/display spoofing at signing time | SDK | Low |

---

## 3. What does exploitation look like on-chain?

| Threat ID | Exploitation scenario | Observable on-chain / system effect(s) |
| :--- | :--- | :--- |
| Elev.1 | Leaked admin key registers a malicious observer, which then pushes a false match toward quorum. | `ObserverAdded` event from an unexpected address; followed by `ObservationRecorded`/`CaseMatched` from the new observer. |
| Elev.2 | A case with default `quorum = 1` finalizes on a single observer's signature. | `CaseCreated` with no subsequent `CaseQuorumSet`; `CaseFinalized` with exactly one attested observer. |
| Spoof.1 | Compromised observer key records a false break to stall a settlement. | `CaseBroken` from an observer whose infra shows no corresponding monitoring/heartbeat. |
| DoS.2 | Dormant case state is archived by TTL expiry; queries start failing. | `get_case` returns empty/`NotFound` for a previously known case; archival of contract instance entries. |
| Tamper.4 | DB row edited or indexer skip → proofs disagree with chain. | `POST /v1/proofs/verify/onchain` failures; reconcile job mismatch count > 0. |
| DoS.1 | RPC outage → ingestion stops, then replays. | Indexer cursor stale beyond N ledgers; `getEvents` error rate spike; duplicate-ingestion guard trips. |
| Spoof.2 / Repud.3 | Unauthenticated caller posts cases/attestations through an exposed API. | API access from non-allowlisted networks; case-creation rate anomaly (off-chain only). |
| Info.2 | PAT or seed pushed to the repo. | GitHub secret-scanning alert / push-protection block (off-chain only). |
| Repud.1/2 | A party or observer denies a signed action. | Mismatch between claimed action and on-chain event attributes (`AttestationSubmitted`, `CaseMatched` + caller address + ledger). |
| Elev.3 | Revoked observer's earlier attestations keep a quorum alive. | `ObserverRemoved` while the observer remains in `get_attested_observers` for open cases. |

Threats with **no on-chain effect** (Info.2, Info.3, Info.4, Spoof.2, Spoof.3, Repud.3, DoS.1, DoS.3, Spoof.4) are monitored off-chain via logs, CI, and infrastructure alerts — recorded as such rather than dropped.

---

## 4. What will we monitor for?

Each monitor is identified `<ThreatID>.M.<n>` and traces to its threat; remediations remain `<ThreatID>.R.<n>` in the threat model.

| Monitor ID | Observable effect | Trigger condition & baseline | Monitoring rule (plain-language intent) |
| :--- | :--- | :--- | :--- |
| Elev.1.M.1 | `ObserverAdded` / `ObserverRemoved` events | Any registry event. Baseline: registry changes only during approved onboarding/rotation windows. | We address Elev.1 in the SettlementRegistry by monitoring for any observer-registry change at the deployed contract ID. |
| Elev.1.M.2 | Admin address on contract instance | Any change of admin. Baseline: zero changes post-deploy. | Alert immediately on any admin change. |
| Elev.2.M.1 | `CaseCreated` without prior `CaseQuorumSet` | Case created and later attested with quorum = 1. Baseline: mainnet cases must set quorum ≥ 2 before attestation (Elev.2.R.1). | Alert when a case reaches attestation stage with quorum < 2. |
| Elev.2.M.2 | `CaseFinalized` events | Finalization with fewer than 2 distinct attested observers on mainnet. Baseline: 0 such finalizations. | Alert on any finalization below policy quorum. |
| Spoof.1.M.1 | `ObservationRecorded` / `CaseMatched` / `CaseBroken` per observer | Per-observer event velocity above its historical baseline, or events outside its usual ledger window. Baseline: established per observer in first 30 days (Tuning). | Alert on anomalous observer activity (possible key compromise). |
| DoS.2.M.1 | Contract instance / entry TTL + `get_case` liveness | TTL of case entries below refresh threshold, or `get_case` failing for a known case. Baseline: all active-case entries persistent and reachable. | Alert before any case entry approaches archival. |
| Tamper.4.M.1 | Chain-vs-DB reconciliation job | Any mismatch between indexed state and contract state. Baseline: 0. | Alert on any divergence; treat proofs as invalid until reconciled. |
| DoS.1.M.1 | Indexer cursor ledger vs network ledger | Cursor lag > 50 ledgers (~4 min) or RPC error rate > 5%/min. Baseline: lag ≈ 0 in steady state. | Alert on ingestion stall or repeated RPC failures. |
| Spoof.2.M.1 / Repud.3.M.1 | API access logs (source, path, volume) | Requests from non-allowlisted networks, or case-creation rate > 10× rolling baseline. Baseline: private-network callers only. | Alert on unauthenticated or anomalous API access (until Spoof.2.R.1 ships). |
| Info.2.M.1 | GitHub secret scanning / push protection | Any secret-scan alert on either repository. Baseline: 0. | Alert on detection; rotate credential immediately (Info.2.R.1). |
| Info.4.M.1 | Compose/port configuration + cloud firewall audit | Postgres port reachable from public internet, or API published without gateway controls. Baseline: never. | Alert on exposure drift during deploys. |
| Info.3.M.1 / Spoof.3.M.1 | WebSocket stream connections | Stream listener bound beyond localhost without `INDEXER_STREAM_AUTH_TOKEN`, or unauthenticated subscriber. Baseline: localhost or token required. | Alert on unauthenticated stream exposure. |
| Elev.3.M.1 | `ObserverRemoved` vs `get_attested_observers` | Revoked observer present in attested set of any non-finalized case. Baseline: reviewed case-by-case. | Alert to trigger quorum review (Elev.3.R.1). |
| Repud.1.M.1 / Repud.2.M.1 | Attestation/match/break event attributes | Event caller not in expected role set for the case. Baseline: 0. | Alert on role-inconsistent events (corroborates on-chain non-repudiation). |
| DoS.4.M.1 | `DisputeOpened` age vs `dispute_expires_at_ledger` | Active dispute approaching TTL without resolution. Baseline: resolved before expiry. | Advisory alert so disputes do not silently expire (availability of resolution, not correctness). |
| DoS.3.M.1 | API 4xx/5xx rate + p99 latency | Sustained error/latency spike under load. Baseline: normal operating envelope. | Alert on suspected flood or exhaustion. |

Prometheus exposition (`/metrics`, Issue #18) is the intended delivery vehicle for the API/indexer monitors; on-chain monitors are implemented as RPC event subscriptions in the indexer plus a scheduled `get_case`/event sweep.

---

## 5. What happens when an alert fires?

| Monitor ID(s) | Severity | Response / action (who, channel, automated action) | Owner | Status | Last reviewed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Elev.1.M.1/.M.2, Info.2.M.1 | Critical | Page on-call maintainer (email + GitHub Security Advisory); freeze observer onboarding; rotate affected keys; assess whether affected observers' attestations require Elev.3 review | Protocol Security (maintainer on-call) | Planned | 2026-10-08 |
| Elev.2.M.1/.M.2 | Critical | Investigate finalization; if quorum < policy, halt further finalizations and notify counterparties of the affected cases; fix deployment policy (Elev.2.R.1) | Protocol Security | Planned | 2026-10-08 |
| DoS.2.M.1 | High | Trigger TTL refresh/restoration for affected entries; open incident; confirm evidence still queryable | Protocol Security | Planned | 2026-10-08 |
| Spoof.1.M.1, Elev.3.M.1 | High | Suspend the observer in the registry (admin action), notify counterparties, review outstanding attestations against quorum | Protocol Security | Planned | 2026-10-08 |
| Tamper.4.M.1, DoS.1.M.1 | High | Pause dependent API writes, reconcile from chain replay, post incident note | Maintainers | Planned | 2026-10-08 |
| Spoof.2.M.1, Repud.3.M.1, Info.4.M.1, Info.3.M.1, Spoof.3.M.1 | Medium | Block source at gateway; verify exposure scope; ship the corresponding `.R` remediation | Maintainers | Planned | 2026-10-08 |
| DoS.3.M.1 | Medium | Apply rate limit / request caps at proxy; scale or shed load | Maintainers | Planned | 2026-10-08 |
| DoS.4.M.1 | Low | Advisory notification to case parties | Maintainers | Planned | 2026-10-08 |

Status values: **Active** (live and alerting), **Tuning** (live, thresholds being refined), **Planned** (agreed, not yet implemented). v0.1.1 is honest about its state: monitors are **Planned**, wired to the existing event stream and health probes; bringing them to **Active** is scheduled in upcoming releases alongside the Prometheus endpoint (Issue #18).

---

## 6. Did we do a good job? (self-check)

- ✅ Every threat in the [threat model](./threat-model.md) has ≥ 1 monitor or a documented off-chain monitoring note (§3).
- ✅ Trigger thresholds are grounded in stated baselines (per-observer baselines start in Tuning, explicitly noted).
- ✅ Every monitor has a defined response, an owner, and a status (§5).
- ⬜ Have any monitors fired? Were they true positives? Did the response work? — n/a until monitors are Active.
- ✅ On-chain address inventory current for v0.1.1 (§1); must be updated at mainnet deploy.
- ⬜ Open threats surfaced only off-chain (Spoof.2, Info.2, DoS.1) are tracked in the threat model's residual-risk table.

**Revisit this plan whenever contracts, addresses, or the threat model change — in the same change.**
