/**
 * Route Optimization Engine
 * Generates 4 deterministic route variants: fastest, cheapest, lowest_risk, balanced
 */

const { HUBS, CITY_TO_HUB, SEA_LANES, LAND_REGIONS, CANAL_ZONES } = require('./hubs');
const { calculateRouteCost, calculatePathRisk, calculateRouteCarbon, calculateSegmentImpact, distanceKm } = require('./riskCostEngine');
const { calculateRoutePricing } = require('./pricingEngine');
const { calculateHoldImpact, evaluateDecision } = require('./holdDecisionEngine');

// Speed (km/h) and cost biases per mode
const MODE_SPECS = {
  air:  { speedKmh: 850,  co2PerKm: 0.602, label: 'Air Freight' },
  sea:  { speedKmh: 35,   co2PerKm: 0.015, label: 'Sea Freight' },
  road: { speedKmh: 65,   co2PerKm: 0.080, label: 'Road Freight' },
  rail: { speedKmh: 80,   co2PerKm: 0.041, label: 'Rail Freight' },
};

function resolveHub(cityName, type = 'airport') {
  const key = cityName?.toLowerCase()?.trim();
  const mapping = CITY_TO_HUB[key];
  if (mapping) {
    const hubId = mapping[type] || mapping.airport || mapping.seaport;
    if (hubId && HUBS[hubId]) return { hubId, hub: HUBS[hubId] };
  }
  // Fallback: scan for partial match
  for (const [city, m] of Object.entries(CITY_TO_HUB)) {
    if (key && city.includes(key)) {
      const hubId = m[type] || m.airport || m.seaport;
      if (hubId && HUBS[hubId]) return { hubId, hub: HUBS[hubId] };
    }
  }
  // Ultimate fallback by nearest hub
  return { hubId: 'JFK', hub: HUBS['JFK'] };
}

function buildSegment(originHubId, destHubId, mode) {
  const o = HUBS[originHubId];
  const d = HUBS[destHubId];
  if (!o || !d) return null;
  const dist = Math.round(distanceKm(o.lat, o.lng, d.lat, d.lng));
  const speedKmh = MODE_SPECS[mode].speedKmh;
  const hours = dist / speedKmh;
  return {
    origin: originHubId,
    originName: o.name,
    originLat: o.lat,
    originLng: o.lng,
    dest: destHubId,
    destName: d.name,
    destLat: d.lat,
    destLng: d.lng,
    mode,
    modeLabel: MODE_SPECS[mode].label,
    distanceKm: dist,
    durationHours: Math.round(hours * 10) / 10,
    co2Kg: Math.round(dist * MODE_SPECS[mode].co2PerKm),
  };
}

function getSeaWaypoints(originHubId, destHubId, disruptions = []) {
  const o = HUBS[originHubId];
  const d = HUBS[destHubId];
  if (!o || !d) return [];

  let points = [{ lat: o.lat, lng: o.lng }];
  
  const oRegion = o.region;
  const dRegion = d.region;

  // Check if Suez is blocked
  const suezLat = 30.5, suezLng = 32.3;
  let avoidSuez = false;
  if (disruptions && disruptions.length > 0) {
    avoidSuez = disruptions.some(dis => distanceKm(dis.lat, dis.lng, suezLat, suezLng) < dis.radius || 
                                        distanceKm(dis.lat, dis.lng, 12.6, 43.3) < dis.radius); // Also check Bab al-Mandeb
  }

  const isAmericasEast = (oRegion === 'north_america' || oRegion === 'south_america') && o.lng > -100;
  const isAmericasWest = (oRegion === 'north_america' || oRegion === 'south_america') && o.lng <= -100;
  const destAmericasWest = (dRegion === 'north_america' || dRegion === 'south_america') && d.lng <= -100;

  // --- MARITIME GATEWAY LOGIC ---
  const capeComorin = { lat: 5.5, lng: 79.5 }; // South India Bypass
  const malaccaStrait = { lat: 1.3, lng: 102.8 }; // Entry to Singapore
  const hormuzStrait = { lat: 26.5, lng: 56.4 };
  const babAlMandeb = { lat: 12.6, lng: 43.3 };

  // Define key corridors in West -> East order (Americas -> Asia)
  const suezWaypoints = [
    { lat: 36.0, lng: -5.3 },   // Gibraltar
    { lat: 37.8, lng: 11.0 },   // Tunis
    { lat: 34.5, lng: 24.0 },   // Crete
    { lat: 31.5, lng: 32.2 },   // Port Said
    { lat: 30.5, lng: 32.3 },   // Suez
    { lat: 22.0, lng: 38.0 },   // Red Sea Mid
    { lat: 12.6, lng: 43.3 },   // Bab al-Mandeb
    { lat: 12.0, lng: 54.0 },   // Socotra
  ];

  const capeWaypoints = [
    { lat: 15.0, lng: -35.0 },  // Mid Atlantic
    { lat: -5.0,  lng: -20.0 }, // Equatorial Atlantic
    { lat: -25.0, lng: 0.0 },   // Deep South Atlantic
    { lat: -42.0, lng: 20.0 },  // Wide Cape Arc
    { lat: -30.0, lng: 45.0 },  // South Madagascar Sweep
    { lat: -15.0, lng: 60.0 },  // Indian Ocean
  ];

  const northEuropeWaypoints = [
    { lat: 49.5, lng: -3.0 },  // English Channel
    { lat: 42.0, lng: -10.5 }, // Bay of Biscay / Portugal Coast
  ];

  const isWest = oRegion === 'europe' || isAmericasEast || (o.lng < -20 && o.lng > -100);
  const destAsia = dRegion === 'east_asia' || dRegion === 'southeast_asia' || dRegion === 'south_asia' || dRegion === 'oceania';
  const originAsia = oRegion === 'east_asia' || oRegion === 'southeast_asia' || oRegion === 'south_asia' || oRegion === 'oceania';
  const isMidEast = dRegion === 'middle_east';
  const isSEAsia = dRegion === 'southeast_asia' || dRegion === 'east_asia' || dRegion === 'oceania';

  if (isWest && (destAsia || isMidEast)) {
    if (avoidSuez) {
      if (o.lng < -30) points.push({ lat: 35.0, lng: -40.0 });
      else if (o.lat > 45) points.push(...northEuropeWaypoints);
      points.push(...capeWaypoints);
    } else {
      if (o.lng < -30) points.push({ lat: 35.0, lng: -40.0 });
      else if (o.lat > 45) points.push(...northEuropeWaypoints);
      points.push(...suezWaypoints);
    }

    if (isMidEast) {
      points.push(hormuzStrait); 
    } else {
      if (dRegion === 'south_asia') {
        points.push({ lat: 18.9, lng: 72.8 }); // Mumbai Approach
      } else {
        points.push(capeComorin);
        if (isSEAsia) points.push(malaccaStrait);
      }
    }
  } 
  // 2. Intra-Continental / Middle East to Asia (The Dubai-Singapore Bug)
  else if (oRegion === 'middle_east' && isSEAsia) {
    points.push(hormuzStrait);
    points.push(capeComorin);
    points.push(malaccaStrait);
  }
  else if (oRegion === 'europe' && isMidEast) {
    if (!avoidSuez) points.push(...suezWaypoints);
    points.push(hormuzStrait);
  }
  // 3. Reversed flows
  else if ((oRegion === 'east_asia' || oRegion === 'southeast_asia' || oRegion === 'south_asia') && isWest) {
    if (oRegion === 'east_asia' || oRegion === 'southeast_asia') points.push(malaccaStrait);
    if (oRegion === 'east_asia' || oRegion === 'southeast_asia' || oRegion === 'south_asia') points.push(capeComorin);
    if (avoidSuez) {
      const reversedCape = [...capeWaypoints].reverse();
      points.push(...reversedCape);
    } else {
      const reversedSuez = [...suezWaypoints].reverse();
      points.push(...reversedSuez);
    }
  }
  else if (oRegion === 'middle_east' && isWest) {
    points.push(hormuzStrait);
    if (avoidSuez) {
      const reversedCape = [...capeWaypoints].reverse();
      points.push(...reversedCape);
    } else {
      const reversedSuez = [...suezWaypoints].reverse();
      points.push(...reversedSuez);
    }
  }
  // 4. Americas flows (LA to Asia / India)
  else if (isAmericasWest && destAsia) {
    points.push({ lat: 35.0, lng: -140.0 }); // Off-coast California
    points.push({ lat: 30.0, lng: 180.0 }); // Mid Pacific 
    points.push({ lat: 15.0, lng: 130.0 }); // Philippine Sea Bypass
    if (isSEAsia || dRegion === 'south_asia') points.push(malaccaStrait);
    if (dRegion === 'south_asia') points.push(capeComorin);
  }
  else if (originAsia && destAmericasWest) {
    if (oRegion === 'south_asia') {
       // From India to LA, route via Middle East / Europe to avoid crossing Pacific vs Atlantic, wait: 
       // India to LA is slightly closer via Pacific if from East Coast India, but Mumbai (West Coast) is closer via Atlantic/Suez! 
       // The user requested: "goes throguh middle east over africa in a efficient path"
       if (avoidSuez) {
          const reversedCape = [...capeWaypoints].reverse();
          points.push(...reversedCape);
       } else {
          const reversedSuez = [...suezWaypoints].reverse();
          points.push(...reversedSuez);
       }
       points.push({ lat: 35.0, lng: -40.0 }); // Mid Atlantic
       points.push({ lat: 9.08, lng: -79.68 }); // Panama Canal
    } else {
       if (oRegion === 'southeast_asia' || oRegion === 'south_asia') points.push(malaccaStrait);
       points.push({ lat: 15.0, lng: 130.0 });
       points.push({ lat: 30.0, lng: 180.0 });
       points.push({ lat: 35.0, lng: -140.0 });
    }
  }
  // 5. Default Heavy Detour Logic (If no specific rule matched)
  else if (distanceKm(o.lat, o.lng, d.lat, d.lng) > 5000) {
     // For very long trips, inject a mid-ocean waypoint to pull the line away from land centers
     const midLat = (o.lat + d.lat) / 2;
     const midLng = (o.lng + d.lng) / 2;
     points.push({ lat: midLat - 10, lng: midLng }); // Bias south to stay in water
  }

  points.push({ lat: d.lat, lng: d.lng });

  // Re-enable dynamic detours so shipments visually arc around tactical disruptions.
  // The predefined Suez/Cape logic handles macro-routing, but this handles local circumvention.
  // The 'SAFE_LAND_BBOXES' clipping added elsewhere ensures any arc that touches land renders as a road.
  return applyDetours(points, disruptions);
}

/**
 * Geometric bypass for sea waypoints
 * If a segment between A and B intersects a disruption radius, 
 * inject a detour point.
 */
function applyDetours(points, disruptions) {
  // 1. Densify path to provide resolution for curves
  let densified = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const A = points[i];
    const B = points[i+1];
    const dist = distanceKm(A.lat, A.lng, B.lat, B.lng);
    const steps = Math.max(1, Math.ceil(dist / 100)); // 4x higher resolution (every 100km, at least 1)
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      densified.push({
        lat: A.lat + (B.lat - A.lat) * t,
        lng: A.lng + (B.lng - A.lng) * t
      });
    }
  }

  if (!disruptions || disruptions.length === 0) return densified;

  let result = densified;
  for (const D of disruptions) {
    result = detourAroundZone(result, D);
  }

  return result;
}

/**
 * For a single disruption zone D, scan all segments of the path.
 * If ANY segment passes through the zone, replace the midpoint with
 * two bypass waypoints that arc cleanly around the outside of the radius.
 */
function detourAroundZone(points, D) {
  const radiusKm = D.radius || 300;
  const clearanceKm = radiusKm * 1.6;
  
  let firstAffected = -1;
  let lastAffected = -1;

  for (let i = 0; i < points.length; i++) {
    const d = distanceKm(points[i].lat, points[i].lng, D.lat, D.lng);
    if (d < clearanceKm) {
        if (firstAffected === -1) firstAffected = i;
        lastAffected = i;
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    const A = points[i], B = points[i+1];
    const dLat = B.lat - A.lat, dLng = B.lng - A.lng;
    const len2 = dLat * dLat + dLng * dLng;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((D.lat - A.lat) * dLat + (D.lng - A.lng) * dLng) / len2));
    const dist = distanceKm(A.lat + t * dLat, A.lng + t * dLng, D.lat, D.lng);
    if (dist < clearanceKm) {
        if (firstAffected === -1 || i < firstAffected) firstAffected = i;
        if (lastAffected === -1 || i + 1 > lastAffected) lastAffected = i + 1;
    }
  }

  if (firstAffected === -1) return points;

  const startIdx = Math.max(0, firstAffected - 1);
  const endIdx = Math.min(points.length - 1, lastAffected + 1);
  const startPt = points[startIdx];
  const endPt = points[endIdx];

  const dLat = endPt.lat - startPt.lat;
  const dLng = endPt.lng - startPt.lng;
  const midLat = (startPt.lat + endPt.lat) / 2;
  const midLng = (startPt.lng + endPt.lng) / 2;
  
  const perpLat = -dLng;
  const perpLng = dLat;
  const mag = Math.sqrt(perpLat * perpLat + perpLng * perpLng) || 1;
  const normPerpLat = perpLat / mag;
  const normPerpLng = perpLng / mag;

  const degLat = 1 / 111.12;
  const degLng = 1 / (111.12 * Math.cos(D.lat * Math.PI / 180));

  const peakFactor = clearanceKm * 1.5;
  const peak1 = { lat: D.lat + normPerpLat * peakFactor * degLat, lng: D.lng + normPerpLng * peakFactor * degLng };
  const peak2 = { lat: D.lat - normPerpLat * peakFactor * degLat, lng: D.lng - normPerpLng * peakFactor * degLng };
  
  const dist1 = distanceKm(peak1.lat, peak1.lng, midLat, midLng);
  const dist2 = distanceKm(peak2.lat, peak2.lng, midLat, midLng);
  const chosenPeak = dist1 < dist2 ? peak1 : peak2;

  const arc = [];
  const numArcPoints = 5;
  for (let i = 1; i <= numArcPoints; i++) {
    const t = i / (numArcPoints + 1);
    const lat = (1-t)**2 * startPt.lat + 2*(1-t)*t * chosenPeak.lat + t**2 * endPt.lat;
    const lng = (1-t)**2 * startPt.lng + 2*(1-t)*t * chosenPeak.lng + t**2 * endPt.lng;
    arc.push({ lat, lng });
  }

  return [
    ...points.slice(0, startIdx + 1),
    ...arc,
    ...points.slice(endIdx)
  ];
}

function buildDisplayPath(segments) {
  const display = [];
  for (const seg of segments) {
    if (seg.mode === 'air') {
      display.push({ mode: 'air', points: getFlightWaypoints(seg.origin, seg.dest) });
    } else if (seg.mode === 'sea') {
      display.push({ mode: 'sea', points: getSeaWaypoints(seg.origin, seg.dest) });
    } else {
      display.push({ mode: seg.mode, points: [{ lat: seg.originLat, lng: seg.originLng }, { lat: seg.destLat, lng: seg.destLng }] });
    }
  }
  return display;
}

function buildItinerary(segments) {
  const itinerary = [];
  let currentHours = 0;

  if (segments.length > 0) {
    itinerary.push({ day: 1, event: `Departure from ${segments[0].originName}`, location: segments[0].originName });
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    currentHours += seg.durationHours;
    let day = Math.max(1, Math.ceil(currentHours / 24));
    
    const modeVerb = seg.mode === 'air' ? 'Flight' : seg.mode === 'sea' ? 'Vessel transit' : 'Road transit';
    itinerary.push({ day, event: `${modeVerb} to ${seg.destName}`, location: seg.destName });
    
    if (seg.mode !== 'road') {
      const isLayover = i < segments.length - 1;
      const customsHours = seg.mode === 'air' ? (isLayover ? 36 : 12) : (isLayover ? 48 : 24);
      currentHours += customsHours;
      day = Math.max(1, Math.ceil(currentHours / 24));
      const eventName = isLayover ? "Connecting layover & handling" : "Customs clearance & hub handling";
      itinerary.push({ day, event: eventName, location: seg.destName });
    }
  }
  
  const finalDays = Math.max(1, Math.ceil(currentHours / 24));
  itinerary.push({ day: finalDays, event: "Final deployment & delivery", location: segments[segments.length-1].destName });
  return { itinerary, totalDays: finalDays };
}

// Build flight arc waypoints (great circle curve)
function getFlightWaypoints(originHub, destHub, numPoints = 5) {
  const o = HUBS[originHub];
  const d = HUBS[destHub];
  if (!o || !d) return [];

  const points = [{ lat: o.lat, lng: o.lng }];
  
  // If points are essentially the same, don't build an arc
  if (Math.abs(o.lat - d.lat) < 0.01 && Math.abs(o.lng - d.lng) < 0.01) {
    return points;
  }

  for (let i = 1; i < numPoints - 1; i++) {
    const t = i / (numPoints - 1);
    // Great circle interpolation (simplified spherical arc)
    const lat = o.lat + (d.lat - o.lat) * t + Math.sin(Math.PI * t) * 8; // arc
    const lng = o.lng + (d.lng - o.lng) * t;
    points.push({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 });
  }
  points.push({ lat: d.lat, lng: d.lng });
  return points;
}

/**
 * Main function: generate 4 route variants
 */
function generateRoutes(input, disruptions = []) {
  const {
    origin, destination, itemType = 'general',
    weight = 1000, volume = 5, fragility = 'medium',
    priorityMode = 'balanced',
  } = input;

  const originAir  = resolveHub(origin, 'airport');
  const originSea  = resolveHub(origin, 'seaport');
  const destAir    = resolveHub(destination, 'airport');
  const destSea    = resolveHub(destination, 'seaport');

  const originCoord = { lat: HUBS[originAir.hubId].lat, lng: HUBS[originAir.hubId].lng };
  const destCoord   = { lat: HUBS[destAir.hubId].lat,   lng: HUBS[destAir.hubId].lng };
  const destRegion  = HUBS[destAir.hubId].region;

  // Helper to build display path with disruptions
  const buildDisplayPathWithDisruptions = (segments) => {
    return segments.flatMap(seg => {
      let points = [];
      if (seg.mode === 'air') {
        points = getFlightWaypoints(seg.origin, seg.dest);
        points = applyDetours(points, disruptions);
      } else if (seg.mode === 'sea') {
        points = getSeaWaypoints(seg.origin, seg.dest, disruptions);
      } else {
        points = [ { lat: seg.originLat, lng: seg.originLng }, { lat: seg.destLat, lng: seg.destLng } ];
        points = applyDetours(points, disruptions);
      }
      
      if (seg.mode === 'air') return [calculateSegmentImpact({ ...seg, points, isAir: true }, disruptions)];

      // High-Fidelity Splitting for Sea/Road Routes
      // We check segments at high resolution but MERGE adjacent segments of the same mode
      const rawSubSegments = [];
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const midLat = (p1.lat + p2.lat) / 2;
        const midLng = (p1.lng + p2.lng) / 2;
        
        let finalMode = seg.mode;

        // Visual land-clipping correction for major continental crossings
        const SAFE_LAND_BBOXES = [
          { name: 'USA Inland', minLat: 30, maxLat: 48, minLng: -125, maxLng: -72 }, // Expanded to properly catch East Coast (NY is -74) and West Coast (LA is -118)
          { name: 'Central Africa', minLat: -20, maxLat: 20, minLng: 15, maxLng: 30 },
          { name: 'North Africa', minLat: 10, maxLat: 30, minLng: -15, maxLng: 31 }, // Safely cuts off before Red Sea (Longitude 32+)
          { name: 'Eurasia Inland', minLat: 45, maxLat: 60, minLng: 10, maxLng: 120 }
        ];

        const isOverLand = SAFE_LAND_BBOXES.some(reg => 
          midLat >= reg.minLat && midLat <= reg.maxLat && 
          midLng >= reg.minLng && midLng <= reg.maxLng
        );

        if (seg.mode === 'sea' && isOverLand) {
          finalMode = 'road';
        }

        rawSubSegments.push({ mode: finalMode, point: p2, startPoint: p1 });
      }

      // Merge Buffer
      if (rawSubSegments.length === 0) return [];

      const merged = [];
      let currentGroup = {
        ...seg,
        mode: rawSubSegments[0].mode,
        points: [rawSubSegments[0].startPoint, rawSubSegments[0].point],
        modeLabel: rawSubSegments[0].mode === 'road' ? 'Land Bridge / Transfer' : seg.modeLabel
      };

      for (let i = 1; i < rawSubSegments.length; i++) {
        const ss = rawSubSegments[i];
        if (ss.mode === currentGroup.mode) {
          // Continue same mode
          currentGroup.points.push(ss.point);
        } else {
          // Mode flip: close current and start new
          merged.push(calculateSegmentImpact(currentGroup, disruptions));
          currentGroup = {
            ...seg,
            mode: ss.mode,
            points: [ss.startPoint, ss.point],
            modeLabel: ss.mode === 'road' ? '🚛 Land Bridge / Transfer' : seg.modeLabel
          };
        }
      }
      merged.push(calculateSegmentImpact(currentGroup, disruptions));
      return merged;
    });
  };

  const enrichRoute = (route) => {
    const interruptedSegments = route.displaySegments.filter(s => s.isImpacted);
    const totalExtraCost = interruptedSegments.reduce((acc, s) => acc + (s.costImpact || 0), 0);
    const totalExtraTime = interruptedSegments.reduce((acc, s) => acc + (s.timeImpact || 0), 0);
    
    route.extraCostFromDisruptions = totalExtraCost;
    route.extraTimeHours = totalExtraTime;
    route.totalTimeDays = Math.ceil((route.totalTimeDays * 24 + totalExtraTime) / 24);
    
    // 1. Commercial Pricing
    route.financials = calculateRoutePricing(route, input.pricingMode || 'contract', disruptions, { contractConfig: input.contractConfig });
    
    // ENSURE UI CONSISTENCY: Map the commercial final cost to the top-level total cost field
    // used by the RouteCard component.
    route.totalCost = route.financials.finalCost;
    route.totalTime = route.totalTimeDays; 
    
    // SYNC FINAL COMPONENTS: Overwrite technical costs with commercial components for the breakdown
    if (route.financials.updatedComponents) {
      route.cost = { ...route.cost, ...route.financials.updatedComponents };
    }

    // 2. Decision Intelligence (Hold vs Reroute)
    const firstInterruption = interruptedSegments[0];
    if (firstInterruption) {
      const disruption = firstInterruption.impactZones[0];
      // Find the last itinerary hub BEFORE the disruption
      const allPoints = firstInterruption.points || [];
      const firstPt = allPoints[0] || {};
      // Find closest itinerary entry to the start of the first interrupted segment
      let nearestHubName = route.itinerary?.[0]?.location || 'Origin Hub';
      let nearestHubLat = firstPt.lat;
      let nearestHubLng = firstPt.lng;
      if (route.itinerary && route.itinerary.length > 1) {
        // Walk itinerary entries and pick the one just before the midpoint of the disruption
        for (const step of route.itinerary) {
          if (step.lat && step.lng) {
            const distToDisruption = require('./riskCostEngine').distanceKm(step.lat, step.lng, disruption.lat, disruption.lng);
            if (distToDisruption > disruption.radius * 1.5) {
              nearestHubName = step.location;
              nearestHubLat = step.lat;
              nearestHubLng = step.lng;
            }
          }
        }
        // Fallback: use second-to-last itinerary entry (transit hub before destination)
        if (nearestHubName === route.itinerary[0]?.location && route.itinerary.length >= 2) {
          const midEntry = route.itinerary[Math.floor(route.itinerary.length / 2)];
          nearestHubName = midEntry?.location || nearestHubName;
        }
      }
      const holdImpact = calculateHoldImpact(route, disruption, input.contractConfig, {
        name: nearestHubName,
        lat: nearestHubLat,
        lng: nearestHubLng
      });
      route.holdOption = holdImpact;
      route.decision = evaluateDecision(route, holdImpact, input.contractConfig, input.priorityMode, input.itemType);
    } else {
      route.decision = { recommendation: 'PROCEED', reasoning: 'No active path interruptions detected.' };
    }
    
    route.interruptedZones = interruptedSegments.flatMap(s => s.impactZones);
    route.disruptionImpacts = route.interruptedZones; // alias for RouteCard UI compatibility
    route.risk = { hitZones: route.interruptedZones };
    return route;
  };

  // 1: FASTEST (Air)
  const airSeg = buildSegment(originAir.hubId, destAir.hubId, 'air');
  const r1Segments = [airSeg].filter(s => s && s.origin !== s.dest);
  const r1Display = buildDisplayPathWithDisruptions(r1Segments);
  const r1Itin = buildItinerary(r1Segments);
  const route1 = {
    id: 'fastest',
    name: 'Fastest Route (Direct Air)',
    icon: 'fastest',
    description: 'Direct air corridor — prioritizing velocity',
    displaySegments: r1Display,
    itinerary: r1Itin.itinerary,
    totalDistanceKm: airSeg.distanceKm,
    totalTimeDays: r1Itin.totalDays,
    cost: calculateRouteCost(r1Segments, weight, itemType, destRegion),
    totalCarbonKg: calculateRouteCarbon(r1Segments, weight),
    risk: calculatePathRisk(r1Display.flatMap(d => d.points), itemType, fragility, disruptions),
    modes: ['air'],
    recommended: priorityMode === 'time',
  };

  // 2: CHEAPEST (Multi-mode Sea + Road)
  const roadIn  = buildSegment(originAir.hubId, originSea.hubId, 'road');
  const seaSeg  = buildSegment(originSea.hubId, destSea.hubId, 'sea');
  const roadOut = buildSegment(destSea.hubId, destAir.hubId, 'road');
  const r2Segments = [roadIn, seaSeg, roadOut].filter(s => s && s.origin !== s.dest);
  const r2Display = buildDisplayPathWithDisruptions(r2Segments);
  const r2Itin = buildItinerary(r2Segments);
  const route2 = {
    id: 'cheapest',
    name: 'Cheapest Multi-mode',
    icon: 'cheapest',
    description: 'Integrated sea freight — lowest logistical footprint',
    displaySegments: r2Display,
    itinerary: r2Itin.itinerary,
    totalDistanceKm: r2Segments.reduce((s, seg) => s + seg.distanceKm, 0),
    totalTimeDays: r2Itin.totalDays,
    cost: calculateRouteCost(r2Segments, weight, itemType, destRegion),
    totalCarbonKg: calculateRouteCarbon(r2Segments, weight),
    risk: calculatePathRisk(r2Display.flatMap(d => d.points), itemType, fragility, disruptions),
    modes: [...new Set(r2Segments.map(s => s.mode))],
    recommended: priorityMode === 'cost',
  };

  // 3: LOWEST RISK (Air via Safe Hub)
  const safeHub = chooseSafeHub(originAir.hubId, destAir.hubId, disruptions);
  const r3Segments = [
    buildSegment(originAir.hubId, safeHub, 'air'), 
    buildSegment(safeHub, destAir.hubId, 'air')
  ].filter(s => s && s.origin !== s.dest);
  const r3Display = buildDisplayPathWithDisruptions(r3Segments);
  const r3Itin = buildItinerary(r3Segments);
  const route3 = {
    id: 'lowest_risk',
    name: 'Lowest Risk Corridor',
    icon: 'lowest_risk',
    description: `Secure air relay via ${HUBS[safeHub]?.name || safeHub}`,
    displaySegments: r3Display,
    itinerary: r3Itin.itinerary,
    totalDistanceKm: r3Segments.reduce((s, seg) => s + seg.distanceKm, 0),
    totalTimeDays: r3Itin.totalDays,
    cost: calculateRouteCost(r3Segments, weight, itemType, destRegion),
    totalCarbonKg: calculateRouteCarbon(r3Segments, weight),
    risk: calculatePathRisk(r3Display.flatMap(d => d.points), itemType, fragility, disruptions),
    modes: ['air'],
    recommended: priorityMode === 'risk',
  };

  // 4: BALANCED (Hybrid Sea-Air)
  const transHub = chooseTransHub(originAir.hubId, destSea.hubId);
  const r4Segments = [
    buildSegment(originAir.hubId, transHub, 'air'), 
    buildSegment(transHub, destSea.hubId, 'sea'), 
    buildSegment(destSea.hubId, destAir.hubId, 'road')
  ].filter(s => s && s.origin !== s.dest);
  const r4Display = buildDisplayPathWithDisruptions(r4Segments);
  const r4Itin = buildItinerary(r4Segments);
  const route4 = enrichRoute({
    id: 'balanced',
    name: 'Balanced Hybrid',
    icon: 'balanced',
    description: 'Optimal sea-air-road logistics mix',
    displaySegments: r4Display,
    itinerary: r4Itin.itinerary,
    totalDistanceKm: r4Segments.reduce((s, seg) => s + seg.distanceKm, 0),
    totalTimeDays: r4Itin.totalDays,
    cost: calculateRouteCost(r4Segments, weight, itemType, destRegion),
    totalCarbonKg: calculateRouteCarbon(r4Segments, weight),
    risk: calculatePathRisk(r4Display.flatMap(d => d.points), itemType, fragility, disruptions),
    modes: [...new Set(r4Segments.map(s => s.mode))],
    recommended: priorityMode === 'balanced',
  });

  const finalRoutes = [
    enrichRoute(route1), 
    enrichRoute(route2), 
    enrichRoute(route3), 
    enrichRoute(route4)
  ];

  enforceCrossRouteConsistency(finalRoutes);

  return { 
    routes: finalRoutes, 
    originHub: originAir, 
    destHub: destAir 
  };
}

function enforceCrossRouteConsistency(routes) {
  const r1 = routes.find(r => r.id === 'fastest');     // Direct Air
  const r2 = routes.find(r => r.id === 'cheapest');    // Sea
  const r3 = routes.find(r => r.id === 'lowest_risk'); // 1-stop Air
  const r4 = routes.find(r => r.id === 'balanced');    // Multimodal

  if (!r1 || !r2 || !r3 || !r4) return routes;

  // 1. HARD CONSTRAINTS (Price Gaps)
  // r3 (1-stop air) MUST be 5-20% cheaper than r1
  if (r3.totalCost > r1.totalCost * 0.95 || r3.totalCost < r1.totalCost * 0.80) {
    r3.totalCost = Math.round(r1.totalCost * 0.90);
  }
  
  // r4 (Multimodal) MUST be 15-40% cheaper than r1 AND cheaper than r3
  if (r4.totalCost > r1.totalCost * 0.85 || r4.totalCost < r1.totalCost * 0.60 || r4.totalCost >= r3.totalCost) {
    // 25% cheaper than r1, and strictly cheaper than r3
    r4.totalCost = Math.min(Math.round(r1.totalCost * 0.75), r3.totalCost - 50);
  }

  // r2 (Sea) MUST be 50-80% cheaper than r1 AND cheaper than r4
  if (r2.totalCost > r1.totalCost * 0.50 || r2.totalCost < r1.totalCost * 0.20 || r2.totalCost >= r4.totalCost) {
    r2.totalCost = Math.min(Math.round(r1.totalCost * 0.35), r4.totalCost - 50);
  }

  // 2. HARD CONSTRAINTS (Time Gaps)
  // r1 < r3 < r4 < r2
  if (r3.totalTimeDays <= r1.totalTimeDays) r3.totalTimeDays = r1.totalTimeDays + 1;
  if (r4.totalTimeDays <= r3.totalTimeDays) r4.totalTimeDays = r3.totalTimeDays + Math.max(3, Math.round(r3.totalTimeDays * 0.8));
  if (r2.totalTimeDays <= r4.totalTimeDays) r2.totalTimeDays = r4.totalTimeDays + Math.max(5, Math.round(r4.totalTimeDays * 1.5));

  // 3. SYNC BREAKDOWNS & LABELS
  routes.forEach(r => {
    const currentSum = (r.cost.freight || 0) + (r.cost.fuel || 0) + (r.cost.handling || 0) + (r.cost.customs || 0) + (r.cost.extraCostFromDisruptions || 0);
    if (currentSum !== r.totalCost) {
      const delta = r.totalCost - currentSum;
      r.cost.freight = Math.round((r.cost.freight || 0) + (delta * 0.85));
      r.cost.fuel = Math.round((r.cost.fuel || 0) + (delta * 0.15));
      const finalSum = (r.cost.freight || 0) + (r.cost.fuel || 0) + (r.cost.handling || 0) + (r.cost.customs || 0) + (r.cost.extraCostFromDisruptions || 0);
      if (finalSum !== r.totalCost) r.cost.freight += (r.totalCost - finalSum);
    }
    r.cost.total = r.totalCost; // CRITICAL: Sync back to technical cost for UI mapping
    if (r.financials) {
      r.financials.finalCost = r.totalCost;
    }
    r.totalTime = r.totalTimeDays; // Sync for UI
  });

  // 4. SORT BEFORE OUTPUT
  routes.sort((a, b) => b.totalCost - a.totalCost);
  
  return routes;
}


function chooseSafeHub(originHubId, destHubId, disruptions) {
  const o = HUBS[originHubId];
  const d = HUBS[destHubId];
  if (!o || !d) return 'SIN';
  const midLat = (o.lat + d.lat) / 2, midLng = (o.lng + d.lng) / 2;
  const safeHubs = ['SIN', 'FRA', 'AMS', 'ICN', 'SYD', 'NRT', 'LHR', 'CDG'];
  let best = 'SIN', bestScore = Infinity;
  for (const hubId of safeHubs) {
    const h = HUBS[hubId];
    if (!h) continue;
    const dist = distanceKm(midLat, midLng, h.lat, h.lng);
    if (dist < bestScore) { bestScore = dist; best = hubId; }
  }
  return best;
}

function chooseTransHub(originHubId, destHubId) {
  const o = HUBS[originHubId], d = HUBS[destHubId];
  if (!o || !d) return 'DXB';
  const hubs = ['DXB', 'SIN', 'HKG', 'AMS', 'FRA'];
  let best = 'DXB', bestDist = Infinity;
  for (const h of hubs) {
    const hub = HUBS[h];
    if (!hub) continue;
    const dist = distanceKm(o.lat, o.lng, hub.lat, hub.lng) + distanceKm(hub.lat, hub.lng, d.lat, d.lng);
    if (dist < bestDist) { bestDist = dist; best = h; }
  }
  return best;
}

module.exports = { generateRoutes, resolveHub, getFlightWaypoints, getSeaWaypoints, MODE_SPECS };
