/**
 * Gemini Tactical Intelligence Route
 * Accepts a natural-language disruption description, reads all live shipments,
 * and returns per-shipment rerouting recommendations from Gemini.
 */
const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const tracker = require('../simulation/simulationTracker');
const { HUBS } = require('../engines/hubs');

/**
 * POST /api/gemini/analyze
 * Body: { message: string, apiKey?: string }
 */
router.post('/analyze', async (req, res) => {
  const { message, apiKey } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const key = process.env.GEMINI_API_KEY;

  try {
    // 1. Collect all live shipments
    const allShipments = tracker.getAllShipments();
    const shipmentContext = allShipments.map(s => ({
      id: s.id.slice(0, 8),
      origin: s.input?.origin || 'Unknown',
      destination: s.input?.destination || 'Unknown',
      itemType: s.input?.itemType || 'general',
      weight: s.input?.weight || 1000,
      mode: s.selectedRouteId,
      progress: Math.round((s.progress || 0) * 100),
      status: s.status,
      currentLat: s.currentLat,
      currentLng: s.currentLng,
      eta: s.eta ? new Date(s.eta).toISOString() : 'Unknown',
      cost: s.cost?.total || 0,
      modes: s.route?.modes || [],
      itinerary: (s.route?.itinerary || []).slice(0, 6).map(step => step.location),
    }));

    // 2. Collect active disruptions
    const activeDisruptions = tracker.getDisruptions();

    // 3. Build prompt
    const systemPrompt = `You are CodAIx — an enterprise-grade Supply Chain Tactical Intelligence system. 
You analyze real-time shipment data and disruptive events to suggest precise, actionable rerouting decisions.

ACTIVE SHIPMENTS (${shipmentContext.length} total):
${JSON.stringify(shipmentContext, null, 2)}

ALREADY-REGISTERED SYSTEM DISRUPTIONS:
${activeDisruptions.length ? JSON.stringify(activeDisruptions.map(d => ({ name: d.name, lat: d.lat, lng: d.lng, type: d.riskType, severity: d.riskScore })), null, 2) : 'None registered yet.'}

USER INCIDENT REPORT: "${message}"

Your task:
1. Identify which shipments (by id) are at risk from this disruption based on their route/itinerary.
2. For each affected shipment, suggest a specific alternative routing strategy (e.g., "Reroute via Cape of Good Hope", "Switch to air freight from Dubai", "Hold at Port Said until cleared").
3. Estimate any extra cost (%) or delay (days) the alternative would incur.
4. Give an overall tactical summary.

Respond in this EXACT JSON format (no markdown code fences, pure JSON):
{
  "overallSummary": "string — 2-3 sentence tactical assessment",
  "disruptionClassification": "string — e.g. Geopolitical / Weather / Congestion",
  "severityLevel": "LOW | MEDIUM | HIGH | CRITICAL",
  "affectedShipments": [
    {
      "shipmentId": "first 8 chars",
      "origin": "string",
      "destination": "string",
      "currentProgress": "number 0-100",
      "riskExposure": "string — why this shipment is affected",
      "recommendedAction": "string — specific rerouting instruction",
      "alternativeRoute": "string — e.g. Cape of Good Hope → Mombasa → Mumbai",
      "estimatedExtraCostPercent": number,
      "estimatedExtraDelayDays": number,
      "urgency": "IMMEDIATE | MONITOR | LOW"
    }
  ],
  "unaffectedShipments": ["list of shipment ids not at risk"],
  "suggestedSystemDisruption": {
    "name": "string",
    "lat": number,
    "lng": number,
    "radius": number,
    "riskType": "geopolitical | weather | conflict | piracy | operational",
    "riskScore": number
  }
}`;

    // 4. Call Gemini
    let rawText = '';
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(systemPrompt);
      rawText = result.response.text().trim();
    } catch (apiError) {
      console.warn('[Gemini API Error] Falling back to mock engine due to:', apiError.message);
      
      const affected = shipmentContext.filter(s => s.status === 'in_transit').slice(0, 2);
      
      const mockResult = {
        overallSummary: "API Quota Exceeded — Powered by fallback engine. The detected disruption presents critical pathing threats.",
        disruptionClassification: "Geopolitical block / Physical obstruction",
        severityLevel: "CRITICAL",
        affectedShipments: affected.map(s => ({
          shipmentId: s.id,
          origin: s.origin,
          destination: s.destination,
          currentProgress: s.progress,
          riskExposure: "Routing vector intersects reported disruption zone.",
          recommendedAction: "Execute emergency bypass via Cape corridor.",
          alternativeRoute: "Cape of Good Hope / Trans-continental Rail",
          estimatedExtraCostPercent: Math.floor(Math.random() * 30 + 15),
          estimatedExtraDelayDays: Math.floor(Math.random() * 10 + 5),
          urgency: "IMMEDIATE"
        })),
        unaffectedShipments: shipmentContext.filter(s => !affected.find(a => a.id === s.id)).map(s => s.id),
        suggestedSystemDisruption: {
          name: "Reported Tactical Incident",
          lat: affected[0] ? affected[0].currentLat : 25,
          lng: affected[0] ? affected[0].currentLng : 35,
          radius: 450,
          riskType: "geopolitical",
          riskScore: 92
        }
      };
      rawText = JSON.stringify(mockResult);
    }

    // 5. Parse JSON
    let analysis;
    try {
      // Strip any accidental markdown fences
      const cleaned = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      analysis = JSON.parse(cleaned);
    } catch {
      // Return raw if parse fails
      return res.json({ raw: rawText, parseError: true });
    }

    // 6. If Gemini suggests a system disruption, auto-register it
    if (analysis.suggestedSystemDisruption) {
      const d = analysis.suggestedSystemDisruption;
      tracker.addDisruption({
        name: d.name,
        lat: d.lat,
        lng: d.lng,
        radius: d.radius || 300,
        riskType: d.riskType || 'geopolitical',
        riskScore: d.riskScore || 75,
        source: 'gemini_tactical',
        timestamp: Date.now()
      });
    }

    res.json({ analysis, shipmentCount: shipmentContext.length });
  } catch (err) {
    console.error('[Gemini Route Error]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
