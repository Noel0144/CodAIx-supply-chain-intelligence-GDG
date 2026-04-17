/**
 * Simulation Tracker
 * Manages active shipments in-memory, advances positions on tick, handles disruptions
 */
const { v4: uuidv4 } = require('uuid');
const { generateRoutes } = require('../engines/routeOptimizationEngine');
const { calculatePathRisk } = require('../engines/riskCostEngine');
const { HUBS } = require('../engines/hubs');
const intelligenceEngine = require('../engines/intelligenceEngine');

class SimulationTracker {
  constructor() {
    this.shipments = new Map();
    this.disruptions = [];
    this.tickInterval = null;
    this.tickCount = 0;
  }

  addShipment(input, selectedRouteId = 'balanced') {
    // Generate routes with current disruptions
    const result = generateRoutes(input, this.disruptions);
    const route = result.routes.find(r => r.id === selectedRouteId) || result.routes[3];

    // Synthesize a flat tracking path from segmented data
    const trackingPoints = [];
    if (route.displaySegments) {
      route.displaySegments.forEach(seg => {
        seg.points.forEach(p => trackingPoints.push({ ...p, mode: seg.mode }));
      });
    }

    const shipmentId = uuidv4();
    const eta = Date.now() + (route.totalTimeDays * 24 * 3600000);

    const shipment = {
      id: shipmentId,
      input,
      route,
      selectedRouteId,
      trackingPoints,
      currentSegmentIndex: 0,
      totalSegments: trackingPoints.length - 1,
      progress: 0,
      currentLat: trackingPoints[0]?.lat || 0,
      currentLng: trackingPoints[0]?.lng || 0,
      currentSegmentMode: trackingPoints[0]?.mode || 'road',
      status: 'in_transit',
      startTime: Date.now(),
      eta,
      baseEta: eta, // baseline = actual when no disruption
      lastUpdate: Date.now(),
      cost: route.cost,
      baseCost: route.cost.total, // baseline = actual cost when no disruption
      carbon: route.totalCarbonKg,
      baseCarbon: route.totalCarbonKg,
      risk: route.risk,
      rerouted: false,
      rerouteHistory: [],
      // Zero impact on fresh deploy — only changes when disruptions hit
      impactDelta: { cost: 0, delayHours: 0, carbonKg: 0 },
    };

    this.shipments.set(shipmentId, shipment);
    return shipment;
  }

  getShipment(id) {
    return this.shipments.get(id) || null;
  }

  getAllShipments() {
    return Array.from(this.shipments.values());
  }

  tick() {
    this.tickCount++;
    const updated = [];

    for (const [id, shipment] of this.shipments) {
      if (shipment.status !== 'in_transit') continue;

      const tp = shipment.trackingPoints;
      if (!tp || tp.length < 2) continue;

      // Each tick advances position. Scale based on total path length.
      shipment.progress += 0.15; // Increased speed for better visual feedback

      if (shipment.progress >= 1.0) {
        shipment.progress = 0;
        shipment.currentSegmentIndex++;

        if (shipment.currentSegmentIndex >= tp.length - 1) {
          shipment.status = 'delivered';
          const lastPoint = tp[tp.length - 1];
          shipment.currentLat = lastPoint.lat;
          shipment.currentLng = lastPoint.lng;
          shipment.lastUpdate = Date.now();
          updated.push(shipment);
          continue;
        }
      }

      // Interpolate position along current point-to-point segment
      const idx = shipment.currentSegmentIndex;
      const from = tp[idx];
      const to = tp[idx + 1];
      shipment.currentLat = from.lat + (to.lat - from.lat) * shipment.progress;
      shipment.currentLng = from.lng + (to.lng - from.lng) * shipment.progress;
      shipment.currentSegmentMode = from.mode;

      shipment.lastUpdate = Date.now();

      // Recalculate ETA dynamically on every tick
      const remainingPoints = tp.slice(shipment.currentSegmentIndex + 1);
      let remainingKm = distanceKm(shipment.currentLat, shipment.currentLng, tp[shipment.currentSegmentIndex + 1].lat, tp[shipment.currentSegmentIndex + 1].lng);
      
      for(let i=0; i < remainingPoints.length - 1; i++) {
        remainingKm += distanceKm(remainingPoints[i].lat, remainingPoints[i].lng, remainingPoints[i+1].lat, remainingPoints[i+1].lng);
      }

      // Use the speed ratio from the current route to estimate time remaining
      const speedRatio = (shipment.route.totalDistanceKm || 1) / (shipment.route.totalTimeDays || 1);
      const remainingTimeMs = (remainingKm / speedRatio) * 24 * 60 * 60 * 1000;
      
      shipment.eta = Date.now() + remainingTimeMs;

      // Update Impact Delta based on live ETA vs Base ETA
      if (shipment.baseEta) {
        shipment.impactDelta = {
          ...shipment.impactDelta,
          delayHours: Math.max(0, Math.round((shipment.eta - shipment.baseEta) / (1000 * 60 * 60)))
        };
      }

      updated.push(shipment);
    }

    // Process intelligence (Live Radar) Disabled - we now only rely on manual UI injections
    /*
    const intel = intelligenceEngine.tick();
    if (intel.expiredIds.length > 0) {
      intel.expiredIds.forEach(id => this.removeDisruption(id));
    }
    if (intel.newDisruption) {
      this.addDisruption(intel.newDisruption);
    }
    */

    return updated;
  }

  addDisruption(disruption) {
    const d = {
      id: disruption.id || uuidv4(),
      type: disruption.type,
      lat: disruption.lat,
      lng: disruption.lng,
      radius: disruption.radius || 500,
      riskScore: disruption.riskScore || 80,
      name: disruption.name || `${disruption.type} event`,
      timestamp: Date.now(),
    };

    this.disruptions.push(d);

    const affected = [];
    for (const [id, shipment] of this.shipments) {
      if (shipment.status !== 'in_transit') continue;
      if (this.isAffected(shipment, d)) {
        try {
          this.rerouteShipment(shipment, d);
          affected.push(shipment);
        } catch (err) {
          console.error(`[SimTracker] Failed to reroute shipment ${id}:`, err.message);
        }
      }
    }

    return { disruption: d, affectedShipments: affected };
  }

  removeDisruption(id) {
    const index = this.disruptions.findIndex(d => d.id === id);
    if (index === -1) return false;

    this.disruptions.splice(index, 1);

    for (const [, shipment] of this.shipments) {
      if (shipment.status !== 'in_transit') continue;
      if (!shipment.disruptionDelays) continue;
      const addedHours = shipment.disruptionDelays[id] || 0;
      if (addedHours > 0) {
        shipment.impactDelta.delayHours = Math.max(0, (shipment.impactDelta.delayHours || 0) - addedHours);
        shipment.impactDelta.cost = Math.max(0, (shipment.impactDelta.cost || 0) - (addedHours * 50));
        delete shipment.disruptionDelays[id];
        // Clear rerouted flag if no more disruptions affecting this ship
        if (Object.keys(shipment.disruptionDelays).length === 0) {
          shipment.rerouted = false;
          this.restoreShipment(shipment);
        }
      }
    }

    return true;
  }

  restoreShipment(shipment) {
    // NOTE: This method is now only used for path geometry restore. Delay accounting is
    // handled separately in removeDisruption via disruptionDelays map.
    const originalRouteId = shipment.rerouteHistory.length > 0 ? shipment.rerouteHistory[0].oldRouteId : 'cheapest';
    
    // Call generateRoutes without the current disruptions to see the optimal paths
    const result = generateRoutes(shipment.input, this.disruptions);
    let targetRoute = result.routes.find(r => r.id === originalRouteId);
    if (!targetRoute) targetRoute = result.routes.find(r => r.recommended) || result.routes[0];

    // Splice from current location to target route
    const newTrackingPoints = [{ lat: shipment.currentLat, lng: shipment.currentLng, mode: shipment.currentSegmentMode }];
    if (targetRoute.displaySegments) {
      let minDistance = Infinity;
      let closestSegmentIdx = 0;
      let closestPointIdx = 0;

      targetRoute.displaySegments.forEach((seg, sIdx) => {
        if (seg.mode === shipment.currentSegmentMode) {
          seg.points.forEach((p, pIdx) => {
            const d = distanceKm(shipment.currentLat, shipment.currentLng, p.lat, p.lng);
            if (d < minDistance) {
              minDistance = d;
              closestSegmentIdx = sIdx;
              closestPointIdx = pIdx;
            }
          });
        }
      });

      for (let i = closestSegmentIdx; i < targetRoute.displaySegments.length; i++) {
        const seg = targetRoute.displaySegments[i];
        const startPointIdx = (i === closestSegmentIdx) ? closestPointIdx : 0;
        for (let j = startPointIdx; j < seg.points.length; j++) {
          newTrackingPoints.push({ ...seg.points[j], mode: seg.mode });
        }
      }
      
      if (newTrackingPoints.length === 1) {
        // Find existing segments that are ahead of us
        targetRoute.displaySegments.forEach(seg => {
          seg.points.forEach(p => newTrackingPoints.push({ ...p, mode: seg.mode }));
        });
      }
    }

    // Failsafe: If we somehow ended up with no forward path, abort restoration to prevent disappearance
    if (newTrackingPoints.length <= 1) {
      console.warn(`[RESTORE] Aborting restoration for shipment ${shipment.id} - no valid forward path found.`);
      return;
    }

    shipment.route = targetRoute;
    shipment.trackingPoints = newTrackingPoints;
    shipment.totalSegments = newTrackingPoints.length - 1;
    shipment.currentSegmentIndex = 0;
    shipment.progress = 0;
    shipment.cost = targetRoute.cost; 
    shipment.risk = targetRoute.risk;
    shipment.rerouted = false; 
    
    // Add to history
    shipment.rerouteHistory.push({
      timestamp: Date.now(),
      reason: 'Disruption Resolved - Path Restored',
      oldRouteId: 'disrupted-path',
      oldCost: (shipment.impactDelta?.cost || 0)
    });
    // Recalculate ETA recovery
    const remainingKm = newTrackingPoints.reduce((acc, p, idx) => {
        if (idx === 0) return 0;
        return acc + distanceKm(newTrackingPoints[idx-1].lat, newTrackingPoints[idx-1].lng, p.lat, p.lng);
    }, 0);
    const speedRatio = (targetRoute.totalDistanceKm || 1) / (targetRoute.totalTimeDays || 1); 
    const addedTimeMs = (remainingKm / speedRatio) * 24 * 60 * 60 * 1000;
    
    shipment.eta = Date.now() + addedTimeMs;
    // Reset baseline to "new normal" so delay clears from dashboard
    shipment.baseEta = shipment.eta;

    // Accurate Impact Update: Current Cost vs Base Original Cost
    shipment.impactDelta = {
      cost: Math.max(0, shipment.cost.total - (shipment.baseCost || shipment.cost.total)),
      delayHours: 0,
      carbonKg: Math.max(0, (shipment.carbon || 0) - (shipment.baseCarbon || shipment.carbon || 0))
    };
  }

  isAffected(shipment, disruption) {
    const tp = shipment.trackingPoints;
    if (!tp || tp.length < 2) return false;

    // Fast-fail check: If the ship currently sits instantly inside the blast radius, it is affected.
    if (distanceKm(shipment.currentLat, shipment.currentLng, disruption.lat, disruption.lng) < disruption.radius) {
      return true;
    }

    // Check every segment of the remaining path
    for (let i = shipment.currentSegmentIndex; i < tp.length - 1; i++) {
      const A = tp[i];
      const B = tp[i + 1];

      // Find closest point on segment AB to disruption center D
      const dLat = B.lat - A.lat;
      const dLng = B.lng - A.lng;
      if (dLat === 0 && dLng === 0) {
        if (distanceKm(A.lat, A.lng, disruption.lat, disruption.lng) < disruption.radius) return true;
        continue;
      }

      const t = ((disruption.lat - A.lat) * dLat + (disruption.lng - A.lng) * dLng) / (dLat * dLat + dLng * dLng);
      const clampedT = Math.max(0, Math.min(1, t));
      
      const closestLat = A.lat + clampedT * dLat;
      const closestLng = A.lng + clampedT * dLng;
      
      const distToCenter = distanceKm(closestLat, closestLng, disruption.lat, disruption.lng);
      if (distToCenter < disruption.radius) return true;
    }
    return false;
  }

  rerouteShipment(shipment, disruption) {
    const oldCost = shipment.cost?.total || 0;
    const oldEta  = shipment.eta;

    shipment.rerouteHistory.push({
      timestamp:  Date.now(),
      reason:     disruption.name,
      oldRouteId: shipment.selectedRouteId,
      oldCost,
    });

    // Regenerate routes with active disruptions so the path avoids them
    const result   = generateRoutes(shipment.input, this.disruptions);
    const newRoute = result.routes.find(r => r.id === shipment.selectedRouteId) || result.routes[0];

    // Build new flat tracking path: start from current position, then all points of the new route
    const newTrackingPoints = [
      { lat: shipment.currentLat, lng: shipment.currentLng, mode: shipment.currentSegmentMode }
    ];

    if (newRoute.displaySegments) {
      // Find which segment of the new route is geographically closest to where the ship is now
      let minDist = Infinity;
      let bestSegIdx = 0;
      let bestPtIdx  = 0;

      newRoute.displaySegments.forEach((seg, sIdx) => {
        seg.points.forEach((p, pIdx) => {
          const d = distanceKm(shipment.currentLat, shipment.currentLng, p.lat, p.lng);
          if (d < minDist) { minDist = d; bestSegIdx = sIdx; bestPtIdx = pIdx; }
        });
      });

      // Append from that point onwards
      for (let i = bestSegIdx; i < newRoute.displaySegments.length; i++) {
        const seg = newRoute.displaySegments[i];
        const start = (i === bestSegIdx) ? bestPtIdx : 0;
        for (let j = start; j < seg.points.length; j++) {
          newTrackingPoints.push({ ...seg.points[j], mode: seg.mode });
        }
      }

      // Failsafe: if we only have the ship position, append everything
      if (newTrackingPoints.length <= 1) {
        newRoute.displaySegments.forEach(seg =>
          seg.points.forEach(p => newTrackingPoints.push({ ...p, mode: seg.mode }))
        );
      }
    }

    shipment.route              = newRoute;
    shipment.trackingPoints     = newTrackingPoints;
    shipment.totalSegments      = newTrackingPoints.length - 1;
    shipment.currentSegmentIndex = 0;
    shipment.progress           = 0;
    shipment.cost               = newRoute.cost;
    shipment.risk               = newRoute.risk;
    shipment.rerouted           = true;

    // ── SIMPLE ADDITIVE ACCOUNTING ──────────────────────────────────────────
    // Each disruption that hits a shipment adds a fixed penalty.
    // This is tracked per disruption ID so it can be exactly reversed on removal.
    const DELAY_PER_DISRUPTION_HOURS = 24;  // hrs added per disruption event
    const COST_PER_DISRUPTION = 1200;       // $ added per disruption event

    if (!shipment.disruptionDelays) shipment.disruptionDelays = {};

    // Only add the penalty once per disruption (idempotent)
    if (!shipment.disruptionDelays[disruption.id]) {
      shipment.disruptionDelays[disruption.id] = DELAY_PER_DISRUPTION_HOURS;
      shipment.impactDelta = {
        delayHours: (shipment.impactDelta?.delayHours || 0) + DELAY_PER_DISRUPTION_HOURS,
        cost:       (shipment.impactDelta?.cost || 0) + COST_PER_DISRUPTION,
        carbonKg:   shipment.impactDelta?.carbonKg || 0,
      };
    }
  }

  getDisruptions() {
    return this.disruptions;
  }

  getSystemImpact() {
    const shipmentsArr = Array.from(this.shipments.values());
    const totalCostIncrease = shipmentsArr.reduce((sum, s) => sum + (s.impactDelta?.cost || 0), 0);
    const totalCarbonIncrease = shipmentsArr.reduce((sum, s) => sum + (s.impactDelta?.carbonKg || 0), 0);
    const avgDelay = shipmentsArr.reduce((sum, s) => sum + (s.impactDelta?.delayHours || 0), 0) / (shipmentsArr.length || 1);
    
    return {
      totalCostIncrease,
      totalCarbonIncrease,
      avgDelay: Math.round(avgDelay * 10) / 10
    };
  }

  clearAll() {
    this.shipments.clear();
    this.disruptions = [];
    this.tickCount = 0;
  }
}

// Distance helper
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const tracker = new SimulationTracker();
module.exports = tracker;
