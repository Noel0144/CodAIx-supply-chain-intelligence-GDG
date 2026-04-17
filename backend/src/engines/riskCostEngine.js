/**
 * Risk & Cost Engine
 * All values deterministic — no randomness
 */
const { HUBS } = require('./hubs');

// ── GEOPOLITICAL RISK ZONES (fixed) ──────────────────────────────────────────
const RISK_ZONES = [
  { id: 'hormuz',   name: 'Strait of Hormuz',    lat: 26.59, lng: 56.25,  radius: 300, riskType: 'geopolitical', riskScore: 85, label: 'High Geopolitical Tension' },
  { id: 'red_sea',  name: 'Red Sea / Houthi',    lat: 14.00, lng: 43.00,  radius: 500, riskType: 'conflict',     riskScore: 90, label: 'Active Conflict Zone' },
  { id: 'ukraine',  name: 'Ukraine Conflict',    lat: 49.00, lng: 32.00,  radius: 400, riskType: 'conflict',     riskScore: 95, label: 'War Zone' },
  { id: 'taiwan',   name: 'Taiwan Strait',       lat: 24.50, lng: 120.00, radius: 200, riskType: 'geopolitical', riskScore: 70, label: 'Geopolitical Hotspot' },
  { id: 'somalia',  name: 'Somali Coast',        lat: 5.00,  lng: 48.00,  radius: 350, riskType: 'piracy',       riskScore: 75, label: 'Piracy Risk' },
  { id: 'sahel',    name: 'Sahel Region',        lat: 15.00, lng: 0.00,   radius: 600, riskType: 'instability',  riskScore: 65, label: 'Political Instability' },
  { id: 'earthquake_japan', name: 'Japan Seismic Zone', lat: 36.0, lng: 138.0, radius: 250, riskType: 'natural', riskScore: 55, label: 'Seismic Activity' },
  { id: 'typhoon',  name: 'Western Pacific Typhoon Belt', lat: 22.0, lng: 130.0, radius: 400, riskType: 'weather', riskScore: 60, label: 'Typhoon Risk' },
  { id: 'wenchaun', name: 'Bay of Bengal Cyclone Zone', lat: 15.0, lng: 90.0, radius: 300, riskType: 'weather', riskScore: 55, label: 'Cyclone Zone' },
  { id: 'panabeer', name: 'Panama Canal Congestion', lat: 9.08, lng: -79.68, radius: 100, riskType: 'operational', riskScore: 50, label: 'Port Congestion' },
];

// Distance between two lat/lng points (km) using Haversine
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate risk for a path (array of {lat,lng} waypoints)
 * Returns 0-100 composite risk score + breakdown
 */
function calculatePathRisk(waypoints, itemType, fragility, disruptions = []) {
  const fragilityMod = { low: 0.8, medium: 1.0, high: 1.3 }[fragility?.toLowerCase()] || 1.0;

  // Cargo risk
  const cargoRisk = {
    electronics: 25, perishable: 35, hazardous: 45, pharmaceuticals: 30,
    machinery: 20, textiles: 10, automotive: 20, chemicals: 40,
    food: 25, furniture: 15, general: 15,
  }[itemType?.toLowerCase()] || 15;

  // Zone exposure: how many zone-intersections across the path
  let zoneExposure = 0;
  const allRiskZones = [...RISK_ZONES, ...disruptions];
  const hitZones = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const midLat = (waypoints[i].lat + waypoints[i + 1].lat) / 2;
    const midLng = (waypoints[i].lng + waypoints[i + 1].lng) / 2;

    for (const zone of allRiskZones) {
      const d = distanceKm(midLat, midLng, zone.lat, zone.lng);
      if (d < zone.radius) {
        const exposure = (1 - d / zone.radius) * zone.riskScore;
        zoneExposure = Math.max(zoneExposure, exposure);
        if (!hitZones.find(z => z.id === zone.id)) hitZones.push(zone);
      }
    }
  }

  // Total path length for operational risk
  let totalKm = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalKm += distanceKm(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng);
  }
  const operationalRisk = Math.min(30, totalKm / 500); // 1 pt per 500km, max 30

  // Composite
  const composite = Math.min(100, Math.round(
    (cargoRisk * fragilityMod * 0.3) + (zoneExposure * 0.5) + (operationalRisk * 0.2)
  ));

  return {
    composite,
    breakdown: {
      cargoRisk: Math.round(cargoRisk * fragilityMod),
      zoneExposure: Math.round(zoneExposure),
      operationalRisk: Math.round(operationalRisk),
    },
    hitZones,
    failureProbability: (composite / 100 * 0.15).toFixed(3), // max ~15%
  };
}

// ── COST ENGINE ───────────────────────────────────────────────────────────────
const TRANSPORT_COST_PER_KM = {
  air:  4.20,  // $/km/tonne
  sea:  0.05,  // $/km/tonne
  road: 0.25,  // $/km/tonne
  rail: 0.12,  // $/km/tonne
};

const HANDLING_BY_ITEM = {
  electronics: 180, perishable: 220, hazardous: 350, pharmaceuticals: 300,
  machinery: 200, textiles: 80, automotive: 180, chemicals: 300,
  food: 150, furniture: 100, general: 90,
};

const CUSTOMS_BY_REGION = {
  north_america: 0.03, europe: 0.025, east_asia: 0.04, south_asia: 0.06,
  southeast_asia: 0.035, middle_east: 0.04, africa: 0.07, south_america: 0.08,
  oceania: 0.03, eurasia: 0.05, central_asia: 0.06,
};

const INFLATION_FACTOR = 1.12; // 12% logistics inflation

function calculateRouteCost(segments, weight, itemType, destRegion = 'europe') {
  const primaryMode = segments.find(s => s.mode === 'air') ? 'air' : (segments.find(s => s.mode === 'sea') ? 'sea' : 'road');
  
  let freight = 0, fuel = 0, handling = 0, customs = 0;

  if (primaryMode === 'air') {
    // 1. AIR FREIGHT PRICING (Weight Tiers)
    let ratePerKg = 8.0;
    if (weight > 2000) ratePerKg = 3.0;
    else if (weight > 500) ratePerKg = 4.0;
    else if (weight > 100) ratePerKg = 5.5;
    else ratePerKg = 7.5;

    // Apply distance factor (Sanity check: benchmarks are usually US-China or US-EU)
    // Avg benchmark distance is ~10,000km. If longer, price increases slightly.
    const totalDist = segments.reduce((acc, s) => acc + s.distanceKm, 0);
    const distFactor = Math.max(0.8, totalDist / 10000);
    
    freight = Math.round(weight * ratePerKg * distFactor);
    fuel = Math.round(freight * 0.20); // 20% surcharge
    handling = 150; // Standard handling
    customs = 250;  // Standard per shipment customs

    // Stop factor: +10% if multi-segment air
    const airSegments = segments.filter(s => s.mode === 'air');
    if (airSegments.length > 1) {
      freight = Math.round(freight * 1.12);
      fuel = Math.round(fuel * 1.12);
    }
  } else if (primaryMode === 'sea') {
    // 2. SEA FREIGHT MODEL
    // LCL vs FCL logic
    let totalSeaCost = weight < 1000 ? 450 : 3800;
    
    // Distance adjustment for sea
    const totalDist = segments.reduce((acc, s) => acc + s.distanceKm, 0);
    const distFactor = Math.max(0.7, totalDist / 15000);
    totalSeaCost = Math.round(totalSeaCost * distFactor);

    // Breakdown components (proportional to sum to total exactly)
    freight = Math.round(totalSeaCost * 0.70);
    fuel = Math.round(totalSeaCost * 0.15);
    handling = Math.round(totalSeaCost * 0.10);
    customs = totalSeaCost - (freight + fuel + handling); // Remainder ensures flat sum
  } else {
    // Road/Rail Fallback
    freight = Math.round(weight * 0.5 * (segments.reduce((acc, s) => acc + s.distanceKm, 0) / 1000));
    fuel = Math.round(freight * 0.15);
    handling = 100;
    customs = 50;
  }

  // Multi-modal discount (Air + Sea)
  const isHybrid = segments.some(s => s.mode === 'air') && segments.some(s => s.mode === 'sea');
  if (isHybrid) {
    freight = Math.round(freight * 0.85); // 15% discount for hybrid mix
    fuel = Math.round(fuel * 0.85);
  }

  // Disruption penalties (additive)
  let extraCostFromDisruptions = 0;
  segments.forEach(seg => {
    if (seg.isImpacted) {
      extraCostFromDisruptions += (seg.costImpact || 0);
    }
  });

  const total = freight + fuel + handling + customs + extraCostFromDisruptions;

  return {
    freight,
    fuel,
    handling,
    customs,
    subtotal: freight + fuel + handling + customs,
    extraCostFromDisruptions,
    total,
  };
}

/**
 * High-Fidelity Segment Impact:
 * Checks if a segment intersects ANY disruption by scanning ALL consecutive waypoint pairs.
 * This catches disruptions that intersect the middle of a long flight/sea arc,
 * not just the origin and destination endpoints.
 */
function calculateSegmentImpact(segment, disruptions = []) {
  if (!disruptions || disruptions.length === 0) return { ...segment, isImpacted: false };
  
  const points = segment.points;
  if (!points || points.length < 2) return { ...segment, isImpacted: false };
  
  const impactingZonesMap = new Map();
  let maxPenalty = 0;

  // Scan ALL consecutive point pairs
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dist = distanceKm(p1.lat, p1.lng, p2.lat, p2.lng);
    
    // Sub-sample long segments to ensure we don't miss small disruption radii
    // Sample every 50km for high precision
    const steps = Math.max(1, Math.ceil(dist / 50));
    for (let s = 0; s <= steps; s++) {
      const lat = p1.lat + (p2.lat - p1.lat) * (s / steps);
      const lng = p1.lng + (p2.lng - p1.lng) * (s / steps);

      for (const D of disruptions) {
        const d = distanceKm(lat, lng, D.lat, D.lng);
        // Influence zone is padded (3.0x) to ensure detection on physically detoured routes (which push to ~2.4x)
        if (d < D.radius * 3.0) { 
          const intensity = Math.max(0, 1 - (d / (D.radius * 4.0))); // scaled intensity
          const penalty = intensity * (D.riskScore / 100);
          maxPenalty = Math.max(maxPenalty, penalty);
          const key = D.id || D.name || `${D.lat},${D.lng}`;
          if (!impactingZonesMap.has(key)) impactingZonesMap.set(key, D);
        }
      }
    }
  }

  const impactingZones = [...impactingZonesMap.values()];

  if (impactingZones.length > 0) {
    const segDistKm = segment.distanceKm || distanceKm(points[0].lat, points[0].lng, points[points.length-1].lat, points[points.length-1].lng);
    const costImpact = Math.round(segDistKm * 0.8 * maxPenalty);
    const timeImpact = (segment.durationHours || 1) * 0.5 * maxPenalty;
    
    return {
      ...segment,
      isImpacted: true,
      impactZones: impactingZones,
      costImpact,
      timeImpact
    };
  }

  return { ...segment, isImpacted: false };
}

// ── CARBON FOOTPRINT ENGINE ───────────────────────────────────────────────────
// Default emissions in kg CO2 per tonne-km
const CO2_PER_KM_TONNE = {
  air:  0.500,  // Air freight is highly carbon intensive
  road: 0.100,  // Trucking
  rail: 0.030,  // Trains are efficient
  sea:  0.015,  // Ocean freight is most efficient per tonne-km
};

function calculateRouteCarbon(segments, weight) {
  const weightTonnes = Math.max(weight / 1000, 0.01);
  let totalCarbonKg = 0;
  
  for (const seg of segments) {
    const rate = CO2_PER_KM_TONNE[seg.mode] || 0.100;
    totalCarbonKg += (rate * seg.distanceKm * weightTonnes);
  }
  
  return Math.round(totalCarbonKg);
}

module.exports = {
  calculateRouteCost,
  calculatePathRisk,
  calculateRouteCarbon,
  calculateSegmentImpact,
  distanceKm,
  RISK_ZONES,
  TRANSPORT_COST_PER_KM,
  CO2_PER_KM_TONNE,
};
