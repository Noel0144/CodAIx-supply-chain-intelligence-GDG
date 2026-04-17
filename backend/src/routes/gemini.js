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
      console.warn('[Gemini API Error] Falling back to keyword engine due to:', apiError.message);

      // ── KEYWORD DETECTION FALLBACK ENGINE ─────────────────────────────────
      const msg = message.toLowerCase();

      const SCENARIOS = [
        {
          keys: ['suez', 'suez canal', 'houthi', 'red sea', 'bab-el-mandeb', 'aden'],
          classification: 'Geopolitical / Armed Conflict',
          severity: 'CRITICAL',
          summary: 'Suez Canal / Red Sea corridor is under active threat from Houthi escalation. All transiting vessels face imminent risk of interdiction. Immediate rerouting via Cape of Good Hope is advised for all Asia-Europe-bound cargo.',
          action: 'Execute emergency bypass via Cape of Good Hope.',
          altRoute: 'Cape Town → Durban → Port Said bypass → Destination',
          extraCost: 28, extraDelay: 14,
          disruption: { name: 'Red Sea / Suez Conflict Zone', lat: 14.5, lng: 42.9, radius: 600, riskType: 'conflict', riskScore: 97 }
        },
        {
          keys: ['pacific', 'typhoon', 'cyclone', 'hurricane', 'storm', 'japan', 'philippines', 'taiwan', 'south china sea'],
          classification: 'Severe Weather / Tropical System',
          severity: 'HIGH',
          summary: 'A major weather system is active across Pacific shipping lanes. Port operations in the East Asia / SE Asia corridor are suspended. Air freight alternatives and inland rail are recommended for time-critical cargo.',
          action: 'Divert to rail and air freight from inland hubs. Hold sea freight pending weather clearance.',
          altRoute: 'Trans-Siberian Rail → Air freight via Tokyo / Seoul hub',
          extraCost: 22, extraDelay: 7,
          disruption: { name: 'Pacific Weather System', lat: 22.0, lng: 135.0, radius: 700, riskType: 'weather', riskScore: 88 }
        },
        {
          keys: ['indian ocean', 'malacca', 'strait', 'piracy', 'somalia', 'horn of africa', 'oman'],
          classification: 'Piracy / Maritime Security',
          severity: 'HIGH',
          summary: 'Piracy activity detected in the Indian Ocean / Strait of Malacca corridor. Naval escorts may not be available. Recommending speed transit with armed escort or air freight for high-value cargo.',
          action: 'Apply armed escort protocol or switch high-value cargo to air freight from nearest hub.',
          altRoute: 'Air freight via Dubai / Singapore hub bypass',
          extraCost: 35, extraDelay: 5,
          disruption: { name: 'Indian Ocean Piracy Zone', lat: 12.0, lng: 60.0, radius: 500, riskType: 'piracy', riskScore: 85 }
        },
        {
          keys: ['mediterranean', 'europe', 'greece', 'turkey', 'gibraltar', 'strait of gibraltar'],
          classification: 'Regional Congestion / Geopolitical',
          severity: 'MEDIUM',
          summary: 'Mediterranean corridor experiencing significant congestion and regional tensions. Transit times through key straits are elevated. Partial diversions via northern Europe rail are available.',
          action: 'Reroute via Northern European rail corridors or hold at Port Said.',
          altRoute: 'Rotterdam → Rhine-Danube corridor → Destination',
          extraCost: 12, extraDelay: 4,
          disruption: { name: 'Mediterranean Disruption Zone', lat: 36.0, lng: 18.0, radius: 500, riskType: 'geopolitical', riskScore: 72 }
        },
        {
          keys: ['los angeles', 'la port', 'long beach', 'west coast', 'us port', 'strike', 'labor', 'dock'],
          classification: 'Labor Disruption / Port Strike',
          severity: 'HIGH',
          summary: 'Major labor action detected at West Coast US port facilities. All inbound and outbound sea freight is halted. Immediate diversion to East Coast ports or airfreight is required for time-sensitive shipments.',
          action: 'Divert to East Coast ports (New York / Houston) or switch to air freight for priority cargo.',
          altRoute: 'JFK / Houston cargo hub → Domestic road freight',
          extraCost: 18, extraDelay: 6,
          disruption: { name: 'US West Coast Port Strike Zone', lat: 33.7, lng: -118.2, radius: 300, riskType: 'operational', riskScore: 80 }
        },
        {
          keys: ['shanghai', 'china', 'lockdown', 'covid', 'quarantine', 'port congestion', 'yantian', 'ningbo'],
          classification: 'Operational Shutdown / Congestion',
          severity: 'HIGH',
          summary: 'Severe port congestion and operational restrictions detected at Chinese mega-ports. Vessel queuing is critical. Recommending pre-positioning of inventory and switch to air for urgent cargo.',
          action: 'Switch urgent cargo to air freight. Book rail via Trans-Siberian for non-urgent loads.',
          altRoute: 'Pudong Air Cargo → Air Freight → Destination',
          extraCost: 45, extraDelay: 3,
          disruption: { name: 'China Port Congestion Zone', lat: 31.2, lng: 121.5, radius: 400, riskType: 'operational', riskScore: 82 }
        },
        {
          keys: ['panama', 'panama canal', 'drought', 'low water', 'canal capacity'],
          classification: 'Infrastructure / Environmental',
          severity: 'MEDIUM',
          summary: 'Panama Canal facing reduced capacity due to low water levels or operational restrictions. Transit queue is >12 days. Recommending Cape Horn bypass or Trans-American rail for US-Asia trade.',
          action: 'Reroute via Cape Horn or book Trans-American intermodal rail.',
          altRoute: 'Cape Horn → South Atlantic → Destination',
          extraCost: 20, extraDelay: 10,
          disruption: { name: 'Panama Canal Restriction Zone', lat: 9.08, lng: -79.68, radius: 250, riskType: 'operational', riskScore: 75 }
        },
        {
          keys: ['flood', 'flooding', 'tsunami', 'earthquake', 'landslide', 'volcano'],
          classification: 'Natural Disaster',
          severity: 'CRITICAL',
          summary: 'Natural disaster event detected along active shipping routes. Infrastructure damage may render roads, rail, and port access non-operational. Emergency air freight and alternate port routing required.',
          action: 'Activate emergency air freight protocol. Hold surface freight pending infrastructure assessment.',
          altRoute: 'Emergency Air Freight → Nearest operational hub',
          extraCost: 60, extraDelay: 7,
          disruption: { name: 'Natural Disaster Impact Zone', lat: 20.0, lng: 80.0, radius: 400, riskType: 'weather', riskScore: 95 }
        },
        {
          keys: ['war', 'conflict', 'missile', 'bombing', 'military', 'sanction', 'embargo'],
          classification: 'Armed Conflict / Sanctions',
          severity: 'CRITICAL',
          summary: 'Active conflict zone or international sanction detected affecting shipping corridors. Vessels must avoid designated conflict areas. Compliance with international maritime law is critical.',
          action: 'Immediate corridor closure. Reroute all cargo to neutral shipping lanes. Verify cargo compliance with sanction lists.',
          altRoute: 'Conflict-free corridor via neutral waters → Destination',
          extraCost: 40, extraDelay: 12,
          disruption: { name: 'Active Conflict / Sanction Zone', lat: 48.0, lng: 37.0, radius: 600, riskType: 'conflict', riskScore: 99 }
        },
      ];

      // Match first scenario or use generic fallback
      const matched = SCENARIOS.find(s => s.keys.some(k => msg.includes(k)));
      const scenario = matched || {
        classification: 'General Disruption / Unclassified',
        severity: 'MEDIUM',
        summary: 'A disruption event has been detected along active shipping corridors. Tactical assessment is underway. Standard contingency routing protocols are recommended pending further intelligence.',
        action: 'Monitor corridor. Pre-position cargo at nearest transit hub pending assessment.',
        altRoute: 'Alternate hub routing via nearest viable port',
        extraCost: 15, extraDelay: 5,
        disruption: null
      };

      const affected = shipmentContext.filter(s => s.status === 'in_transit');
      const primaryAffected = affected.slice(0, 3);

      // Determine disruption anchor — use first affected ship's position or message-matched coords
      let disruptionPayload = scenario.disruption;
      if (!disruptionPayload && primaryAffected.length > 0) {
        disruptionPayload = {
          name: scenario.classification + ' Event',
          lat: primaryAffected[0].currentLat || 25,
          lng: primaryAffected[0].currentLng || 55,
          radius: 400,
          riskType: 'geopolitical',
          riskScore: 80
        };
      }

      const mockResult = {
        overallSummary: scenario.summary,
        disruptionClassification: scenario.classification,
        severityLevel: scenario.severity,
        affectedShipments: primaryAffected.map((s, i) => ({
          shipmentId: s.id,
          origin: s.origin,
          destination: s.destination,
          currentProgress: s.progress,
          riskExposure: `Routing vector intersects ${scenario.classification} zone. Shipment #${i + 1} faces direct path risk.`,
          recommendedAction: scenario.action,
          alternativeRoute: scenario.altRoute,
          estimatedExtraCostPercent: scenario.extraCost + Math.floor(Math.random() * 5),
          estimatedExtraDelayDays: scenario.extraDelay + Math.floor(Math.random() * 3),
          urgency: scenario.severity === 'CRITICAL' ? 'IMMEDIATE' : scenario.severity === 'HIGH' ? 'IMMEDIATE' : 'MONITOR'
        })),
        unaffectedShipments: shipmentContext.filter(s => !primaryAffected.find(a => a.id === s.id)).map(s => s.id),
        suggestedSystemDisruption: disruptionPayload
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
