import { PrismaClient, Incident } from '@prisma/client';

export class AiSummaryService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Generates a deterministic summary and optionally enhances it with an LLM.
   * Updates the Ticket.summary asynchronously.
   */
  public async generateSummary(incidentId: string): Promise<void> {
    try {
      const incident = await this.prisma.incident.findUnique({
        where: { id: incidentId },
        include: {
          ticket: true,
          incidentPoles: {
            include: { pole: true }
          }
        }
      });

      if (!incident || !incident.ticket) {
        console.warn(`[AiSummaryService] Incident ${incidentId} or its ticket not found.`);
        return;
      }

      // 1. Generate Deterministic Summary (Always runs)
      const deterministicSummary = this.buildDeterministicSummary(incident);

      // 2. Optional LLM Enhancement
      let finalSummary = deterministicSummary;
      const apiKey = process.env.OPENAI_API_KEY;

      if (apiKey) {
        console.log(`[AiSummaryService] API key found. Enhancing summary for Incident ${incidentId}...`);
        try {
          finalSummary = await this.enhanceWithLLM(deterministicSummary, apiKey);
        } catch (error: any) {
          console.error(`[AiSummaryService] LLM enhancement failed, falling back to deterministic summary. Error:`, error.message);
          // Fallback to deterministic summary is automatic here
        }
      } else {
        console.log(`[AiSummaryService] No API key found. Using deterministic summary for Incident ${incidentId}.`);
      }

      // 3. Save to Database
      await this.prisma.ticket.update({
        where: { id: incident.ticket.id },
        data: { summary: finalSummary }
      });
      console.log(`[AiSummaryService] Successfully saved summary for Ticket ${incident.ticket.id}.`);

    } catch (error) {
      console.error(`[AiSummaryService] Fatal error generating summary for Incident ${incidentId}:`, error);
    }
  }

  /**
   * Builds the strict, rule-based summary template.
   */
  private buildDeterministicSummary(incident: any): string {
    const isEstimated = incident.isEstimatedTopology ? 'Estimated' : 'Official';
    
    // Attempt to extract ward/pincode from the first affected pole
    let locationDetails = '';
    let coordinates = '';
    if (incident.incidentPoles && incident.incidentPoles.length > 0) {
      const p = incident.incidentPoles[0].pole;
      locationDetails = `Ward: ${p.ward}${p.pincode ? `, PIN: ${p.pincode}` : ''}`;
      coordinates = `Lat: ${p.lat}, Lon: ${p.lon}`;
    }

    const confidenceLevel = incident.confidence >= 80 ? 'High' : incident.confidence >= 50 ? 'Medium' : 'Low';
    const verificationStatus = incident.ticket.status === 'verified' || incident.ticket.status === 'closed' ? 'Verified (Telemetry)' : 'Pending Verification';

    return `
# Incident Summary: ${incident.id}

## Core Details
- **Fault Type**: ${incident.faultType || 'Span Fault'}
- **Fault Span**: ${incident.inferredSpan || 'Unknown'}
- **Topology Source**: ${isEstimated}

## Location & Impact
- **Affected Downstream Poles**: ${incident.incidentPoles?.length || incident.downstreamImpact || 0}
- **Coordinates**: ${coordinates || 'Unknown'}
- **Service Area**: ${locationDetails || 'Unknown'}

## Confidence & Verification
- **Confidence Level**: ${confidenceLevel}
- **Confidence Score**: ${incident.confidence}%
- **Ticket Status**: ${incident.ticket.status}
- **Verification Status**: ${verificationStatus}

## Automated Diagnostics
The fault localization engine determined this using ${isEstimated.toLowerCase()} network relationships.
    `.trim();
  }

  /**
   * Sends the deterministic summary to the LLM purely for grammatical and readability enhancement.
   */
  private async enhanceWithLLM(deterministicSummary: string, apiKey: string): Promise<string> {
    const prompt = `
You are a technical editor. Your ONLY job is to improve the readability and grammar of the following operational incident summary.

STRICT RULES:
1. You MUST NOT invent any information, coordinates, or facts.
2. You MUST NOT change the confidence score or any technical values.
3. You MUST NOT add operational recommendations, next steps, or decision-making logic.
4. You MUST preserve all the original technical facts exactly as provided.
5. Return ONLY the rewritten markdown text. Do not add conversational filler.

ORIGINAL SUMMARY:
${deterministicSummary}
    `.trim();

    // Basic fetch implementation for OpenAI Chat completions
    // This keeps the implementation modular without pulling in heavy SDKs unless needed
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, // Low temperature for maximum determinism
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`LLM API responded with ${response.status}: ${err}`);
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content.trim();
    }
    
    throw new Error('LLM API returned unexpected format');
  }
}
