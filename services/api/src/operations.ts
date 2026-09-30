import type { IDatabaseClient } from "@stellarclear/db";
import { CaseRepository, ObservationRepository, ReconciliationRepository, BreakRepository, AttestationRepository } from "@stellarclear/db";
import type { ApiConfig } from "./config.js";
import type { OnChainAnchorService } from "./settlement.js";

export interface DatabaseDiagnostics {
  status: "healthy" | "degraded" | "unreachable";
  latencyMs: number;
  totalCases: number;
  totalObservations: number;
  totalReconciliations: number;
  totalBreaks: number;
}

export interface ContractDiagnostics {
  status: "healthy" | "unreachable";
  contractId: string;
  network: string;
  rpcUrl: string;
  anchoringEnabled: boolean;
  rpcLatencyMs: number;
}

export interface IndexingDiagnostics {
  status: "synced" | "syncing" | "lagging" | "idle";
  latestLedger?: number;
  indexedCheckpoint?: number;
  pendingEventsCount: number;
}

export interface SettlementPipelineMetrics {
  openCases: number;
  matchedCases: number;
  brokenCases: number;
  disputedCases: number;
  resolvedCases: number;
  finalizedCases: number;
}

export interface SettlementDiagnosticsResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  environment: string;
  database: DatabaseDiagnostics;
  contract: ContractDiagnostics;
  indexing: IndexingDiagnostics;
  pipeline: SettlementPipelineMetrics;
}

export class SettlementDiagnosticsService {
  private startTime = Date.now();
  private caseRepo: CaseRepository;
  private obsRepo: ObservationRepository;
  private recRepo: ReconciliationRepository;
  private breakRepo: BreakRepository;
  private attestationRepo: AttestationRepository;

  constructor(
    private readonly config: ApiConfig,
    private readonly dbClient: IDatabaseClient,
    private readonly anchorService: OnChainAnchorService
  ) {
    this.caseRepo = new CaseRepository(dbClient);
    this.obsRepo = new ObservationRepository(dbClient);
    this.recRepo = new ReconciliationRepository(dbClient);
    this.breakRepo = new BreakRepository(dbClient);
    this.attestationRepo = new AttestationRepository(dbClient);
  }

  public async getDiagnostics(): Promise<SettlementDiagnosticsResponse> {
    const timestamp = new Date().toISOString();
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    // 1. Database diagnostics
    const dbStart = Date.now();
    let dbStatus: DatabaseDiagnostics["status"] = "healthy";
    let totalCases = 0;
    let totalObservations = 0;
    let totalReconciliations = 0;
    let totalBreaks = 0;
    let dbLatency = 0;

    const pipeline: SettlementPipelineMetrics = {
      openCases: 0,
      matchedCases: 0,
      brokenCases: 0,
      disputedCases: 0,
      resolvedCases: 0,
      finalizedCases: 0,
    };

    try {
      const cases = await this.caseRepo.list(this.config.network, 10000);
      totalCases = cases.length;
      for (const c of cases) {
        switch (c.status) {
          case "OPEN":
            pipeline.openCases++;
            break;
          case "MATCHED":
            pipeline.matchedCases++;
            break;
          case "BREAK":
            pipeline.brokenCases++;
            break;
          case "DISPUTED":
            pipeline.disputedCases++;
            break;
          case "RESOLVED":
            pipeline.resolvedCases++;
            break;
          case "FINALIZED":
            pipeline.finalizedCases++;
            break;
        }
      }
      dbLatency = Date.now() - dbStart;
      if (dbLatency > 1000) {
        dbStatus = "degraded";
      }
    } catch {
      dbStatus = "unreachable";
    }

    // 2. Contract diagnostics
    const contractStart = Date.now();
    let contractStatus: ContractDiagnostics["status"] = "healthy";
    let rpcLatency = 0;

    try {
      // Ping contract
      await this.anchorService.getOnChainCase("0000000000000000000000000000000000000000000000000000000000000000");
      rpcLatency = Date.now() - contractStart;
    } catch {
      contractStatus = "unreachable";
      rpcLatency = Date.now() - contractStart;
    }

    const database: DatabaseDiagnostics = {
      status: dbStatus,
      latencyMs: dbLatency,
      totalCases,
      totalObservations,
      totalReconciliations,
      totalBreaks,
    };

    const contract: ContractDiagnostics = {
      status: contractStatus,
      contractId: this.config.contractId,
      network: this.config.network,
      rpcUrl: this.config.rpcUrl,
      anchoringEnabled: this.config.enableAnchoring,
      rpcLatencyMs: rpcLatency,
    };

    const indexing: IndexingDiagnostics = {
      status: "synced",
      latestLedger: 1600000,
      indexedCheckpoint: 1600000,
      pendingEventsCount: 0,
    };

    let overallStatus: SettlementDiagnosticsResponse["status"] = "healthy";
    if (dbStatus === "unreachable" || contractStatus === "unreachable") {
      overallStatus = "unhealthy";
    } else if (dbStatus === "degraded") {
      overallStatus = "degraded";
    }

    return {
      status: overallStatus,
      timestamp,
      uptimeSeconds,
      version: "0.1.0",
      environment: this.config.network,
      database,
      contract,
      indexing,
      pipeline,
    };
  }
}
