import { LocalizationResult } from './LocalizationService';
import { CachedPoleState } from './TelemetryProcessingService';

export interface ConfidenceResult {
  confidenceScore: number;
  confidenceLevel: 'High' | 'Medium' | 'Low';
  confidenceFactors: Record<string, number>;
  explanations: string[];
}

/**
 * Stateless service responsible for calculating an explainable, deterministic
 * confidence score for localized faults.
 * 
 * Design Decision:
 * It does not interact with the database or create incidents. It purely takes
 * the localization evidence and applies a rigid formula to determine how much
 * we trust the fault prediction.
 */
export class ConfidenceService {

  public calculateConfidence(
    result: LocalizationResult,
    poleStates: Map<string, CachedPoleState>,
    hasActiveScheduledOutage: boolean
  ): ConfidenceResult {
    const context: ConfidenceResult = {
      confidenceScore: 100,
      confidenceLevel: 'Low',
      confidenceFactors: { base: 100 },
      explanations: ['Base confidence score set to 100.']
    };

    this.applyTopologyPenalty(context, result);
    this.applyConfirmationBonus(context, result);
    this.applyUnknownPenalty(context, result);
    this.applyFirmwarePenalty(context, result, poleStates);
    this.applyScheduledOutagePenalty(context, hasActiveScheduledOutage);
    this.finalizeScore(context);

    return context;
  }

  private applyTopologyPenalty(context: ConfidenceResult, result: LocalizationResult): void {
    if (result.isEstimatedEdge) {
      context.confidenceFactors.topology = -20;
      context.confidenceScore -= 20;
      context.explanations.push('Topology penalty: -20 points because the boundary edge was estimated via GPS nearest-neighbor.');
    }
  }

  private applyConfirmationBonus(context: ConfidenceResult, result: LocalizationResult): void {
    if (result.affectedCount >= 1) {
      let bonus = 2;
      if (result.affectedCount >= 16) {
        bonus = 8;
      } else if (result.affectedCount >= 6) {
        bonus = 5;
      }
      
      context.confidenceFactors.confirmation = bonus;
      context.confidenceScore += bonus;
      context.explanations.push(`Cascade confirmation bonus: +${bonus} points due to ${result.affectedCount} downstream devices confirming power loss.`);
    }
  }

  private applyUnknownPenalty(context: ConfidenceResult, result: LocalizationResult): void {
    if (result.unknownPolesEncountered > 0) {
      const penalty = result.unknownPolesEncountered * 5;
      context.confidenceFactors.ambiguity = -penalty;
      context.confidenceScore -= penalty;
      context.explanations.push(`Ambiguity penalty: -${penalty} points due to ${result.unknownPolesEncountered} unknown devices upstream of the fault.`);
    }
  }

  private applyFirmwarePenalty(context: ConfidenceResult, result: LocalizationResult, poleStates: Map<string, CachedPoleState>): void {
    const evidencePoles = result.traversedPath || ([result.upstreamPoleId, result.downstreamPoleId].filter(id => id !== null) as string[]);
    
    const hasUnstableFirmware = evidencePoles.some(poleId => {
      const state = poleStates.get(poleId);
      return state?.firmwareVersion === '1.2';
    });

    if (hasUnstableFirmware) {
      context.confidenceFactors.sensorReliability = -10;
      context.confidenceScore -= 10;
      context.explanations.push('Sensor reliability penalty: -10 points because the localization relies on telemetry from unstable firmware 1.2 devices.');
    }
  }

  private applyScheduledOutagePenalty(context: ConfidenceResult, hasActiveScheduledOutage: boolean): void {
    if (hasActiveScheduledOutage) {
      context.confidenceFactors.maintenance = -20;
      context.confidenceScore -= 20;
      context.explanations.push('Maintenance penalty: -20 points because the fault overlaps with an active scheduled outage window.');
    }
  }

  private finalizeScore(context: ConfidenceResult): void {
    // Clamp score between 0 and 100
    context.confidenceScore = Math.max(0, Math.min(100, context.confidenceScore));
    context.confidenceFactors.finalScore = context.confidenceScore;

    // Determine Confidence Level
    if (context.confidenceScore >= 80) {
      context.confidenceLevel = 'High';
    } else if (context.confidenceScore >= 50) {
      context.confidenceLevel = 'Medium';
    } else {
      context.confidenceLevel = 'Low';
    }
  }
}
