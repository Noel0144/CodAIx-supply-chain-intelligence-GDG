/**
 * Logistics Hold vs Reroute Decision Intelligence Engine
 * Standards-based decision logic for global supply chain mitigation.
 */

const DEFAULT_STORAGE_COST_PER_DAY = 400;

const DISRUPTION_DURATIONS = {
  'WEATHER': 2,        // 1-3 days
  'STORM': 3.5,        // 2-5 days
  'CONGESTION': 5,     // 3-7 days
  'STRIKE': 7.5,       // 5-10 days
  'GEOPOLITICAL': 13.5  // 7-20 days
};

/**
 * Calculates current hold vs reroute metrics based on industry standards
 */
function calculateHoldImpact(route, disruption, contractConfig, nearestHubOverride) {
  const category = disruption?.category?.toUpperCase() || disruption?.riskType?.toUpperCase() || disruption?.type?.toUpperCase() || 'WEATHER';
  const duration = DISRUPTION_DURATIONS[category] || 3;
  
  // 1. Base Hold Cost (Storage)
  let baseHoldCost = duration * DEFAULT_STORAGE_COST_PER_DAY;

  // 2. Contractual Adjustments
  const clause = contractConfig?.disruptionClause || 'client_absorbs';
  let discountMultiplier = 1.0;
  
  if (clause === 'carrier_absorbs') discountMultiplier = 0.2; // Carrier covers 80%
  else if (clause === 'shared') discountMultiplier = 0.6;           // Shared 40% reduction
  
  const netHoldCost = baseHoldCost * discountMultiplier;

  // 3. SLA Penalties
  let slaPenalty = 0;
  const maxDays = contractConfig?.sla?.maxTransitDays || 0;
  const totalDaysWithHold = route.totalTimeDays + duration;
  
  if (maxDays > 0 && totalDaysWithHold > maxDays) {
    const delayDays = totalDaysWithHold - maxDays;
    slaPenalty = delayDays * (contractConfig.sla.penaltyPerDayDelay || 250);
  }

  // 4. Nearest Hub: use the override from the engine if available (last safe hub before disruption)
  const nearestHub = nearestHubOverride || {
    name: route.itinerary?.[0]?.location || 'Nearest Transit Point',
    lat: route.displaySegments?.[0]?.points?.[0]?.lat,
    lng: route.displaySegments?.[0]?.points?.[0]?.lng
  };

  return {
    holdDuration: duration,
    storageCost: Math.round(netHoldCost),
    slaPenalty: Math.round(slaPenalty),
    totalHoldCost: Math.round(netHoldCost + slaPenalty),
    nearestHub
  };
}

/**
 * Standardized Decision Intelligence Logic
 */
function evaluateDecision(route, holdImpact, contractConfig, priorityMode, itemType, detourKm = 0) {
  // Use the raw geometrical detour penalty explicitly, overriding any carrier absorptions
  // Floor check at 0 for rerouteOverhead to avoid negative results in UI
  const rerouteOverhead = Math.max(0, route.extraCostFromDisruptions || 0);
  
  // Ensure we have a sensible default overhead if the raw one evaluates to zero but there is a distance detour
  const finalRerouteOverhead = (rerouteOverhead === 0 && detourKm > 0) ? Math.round(detourKm * 1.5) : rerouteOverhead;
  
  const baseFreightCost = route.financials?.baseTechnicalCost || (route.cost.total * 0.7);
  
  let holdCost = holdImpact.totalHoldCost;
  let holdDelay = holdImpact.holdDuration;
  
  // Ensure holdDelay is never 0 in the UI breakdown to avoid "Hold for 0 days"
  const displayHoldDelay = Math.max(1, holdDelay || 0);
  const dailyHoldCost = Math.max(400, holdDelay > 0 ? (holdCost / holdDelay) : 400);
  
  let breakEvenDays = Math.floor(finalRerouteOverhead / dailyHoldCost);
  if (breakEvenDays < 0 || isNaN(breakEvenDays)) breakEvenDays = 0;

  const maxDays = contractConfig?.sla?.maxTransitDays || 0;
  const maxSlaHoldDays = maxDays > 0 ? Math.max(0, maxDays - route.totalTimeDays) : Infinity;
  const viableHoldDays = Math.min(breakEvenDays, maxSlaHoldDays);

  const overheadPct = baseFreightCost > 0 ? Math.round((finalRerouteOverhead/baseFreightCost)*100) : 0;
  const detourDesc = detourKm > 0 ? `Detouring adds ${detourKm}km (+${overheadPct}% cost).` : '';
  const breakEvenDesc = `Alternative: You can hold for up to ${breakEvenDays} days at the hub before storage ($${Math.round(dailyHoldCost)}/day) exceeds the $${Math.round(finalRerouteOverhead)} reroute penalty.`;

  let recommendation = 'REROUTE';
  let reasoning = '';

  const category = route.interruptedZones?.[0]?.category?.toUpperCase() || 'WEATHER';
  const isIndefinite = category === 'GEOPOLITICAL' || category === 'STRIKE';

  if (isIndefinite || holdDelay >= 10) {
    recommendation = 'REROUTE';
    reasoning = `${detourDesc} Indefinite or long-term disruption (${category}). Rerouting is the safest standard. ${breakEvenDesc}`;
  } else if (holdDelay === 0) {
    recommendation = 'REROUTE';
    reasoning = `${detourDesc} Direct path intersection detected. Immediate reroute recommended to maintain schedule. ${breakEvenDesc}`;
  } else {
    const slaBreachWithHold = maxDays > 0 && (route.totalTimeDays + holdDelay > maxDays);
    
    if (holdDelay <= viableHoldDays && !slaBreachWithHold) {
      recommendation = 'HOLD';
      reasoning = `${detourDesc} Disruption is short term (${holdDelay}d). Holding is more cost-effective than the detour overhead. ${breakEvenDesc}`;
    } else {
      recommendation = 'REROUTE';
      reasoning = `${detourDesc} Waiting out the disruption (${holdDelay}d) exceeds profitable storage limits or SLA bounds. ${breakEvenDesc}`;
    }
  }

  // Contract Override Force Majeure
  if (contractConfig?.disruptionClause === 'carrier_absorbs') {
    recommendation = 'REROUTE';
    reasoning = `Contractual Mitigation: Carrier absorbs the $${Math.round(finalRerouteOverhead)} reroute penalty. Detouring provides immediate speed and zero storage fee.`;
  }

  return {
    recommendation,
    reasoning,
    costComparison: {
      hold: Math.round(recommendation === 'REROUTE' ? (displayHoldDelay * dailyHoldCost) : holdCost),
      reroute: Math.round(finalRerouteOverhead)
    },
    timeComparison: {
      hold: Math.round(recommendation === 'REROUTE' ? displayHoldDelay : holdDelay),
      reroute: 1
    }
  };
}

module.exports = { calculateHoldImpact, evaluateDecision };
