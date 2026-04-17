/**
 * Pricing Engine
 * Handles commercial cost adjustments based on Carrier models and Pricing Modes.
 */
const { CARRIERS } = require('./carriers');

/**
 * Calculates final commercial pricing for a route.
 */
function calculateRoutePricing(route, pricingMode = 'spot', disruptions = [], options = {}) {
  const { contractConfig = null } = options;
  const primaryMode = route.modes?.[0] || 'road'; 
  const carrier = CARRIERS.find(c => c.supportedModes.includes(primaryMode)) || CARRIERS[0];

  // Technical baseline from route.cost (which now has freight, fuel, handling, customs)
  let freight = route.cost.freight || 0;
  let fuel = route.cost.fuel || 0;
  let handling = route.cost.handling || 0;
  let customs = route.cost.customs || 0;
  const rawDisruptionCost = route.extraCostFromDisruptions || 0;

  // 1. COMMERCIAL MODEL SELECTION
  if (pricingMode === 'contract' && contractConfig) {
    // Contract provides discounts (e.g. 15-30% off)
    const multiplier = 0.75; // Simplification for high-level logic consistency
    freight = Math.round(freight * multiplier);
    fuel = Math.round(fuel * multiplier);
    handling = Math.round(handling * multiplier);
  } else {
    // Spot premium (Market urgency)
    const multiplier = 1.65; 
    freight = Math.round(freight * multiplier);
    fuel = Math.round(fuel * multiplier);
  }

  const finalCost = freight + fuel + handling + customs + rawDisruptionCost;

  return {
    carrierId: carrier.id,
    carrierName: carrier.name,
    pricingModeUsed: pricingMode,
    // We update the route.cost components so the UI can use them directly
    updatedComponents: {
      freight,
      fuel,
      handling,
      customs,
      extraCostFromDisruptions: rawDisruptionCost
    },
    baseTechnicalCost: freight, 
    finalCost: Math.round(finalCost),
    SLAStatus: 'NOMINAL'
  };
}

/**
 * Enterprise Contract Model: 20-40% Strategic Discounts
 */
function calculateContractCost(route, config, carrier, rawDisruptionCost, rawFreight, baseFuel, fixedHandling) {
  // 1. Initial Partnership Anchor (Significant baseline discount)
  let contractMultiplier = 0.80; // 20% discount default vs technical base
  
  // 2. Pricing Configuration Override
  if (config.rateType === 'tiered') {
     // Strategic Tiers: Gold(0.75), Platinum(0.65)
     const bestTier = [...(config.pricingTiers || [])].sort((a,b) => b.threshold - a.threshold)
                        .find(t => (config.currentVolume || 0) >= t.threshold);
     if (bestTier) contractMultiplier = bestTier.rate;
  } else if (config.baseRateOverride > 0) {
     contractMultiplier = config.baseRateOverride;
  }

  // 3. Capacity Rebate (Strategic impact: up to 10%)
  const capacityRebate = Math.min(0.10, (config.reservedUnitsPerWeek || 0) / 1000);
  contractMultiplier = Math.max(0.60, contractMultiplier - capacityRebate);

  // 4. Volume Incentive
  let volumeAdjustment = 0;
  if (config.volumeCommitment > 0) {
    const volumeRatio = (config.currentVolume || 0) / config.volumeCommitment;
    if (volumeRatio > 1.1) volumeAdjustment = -(rawFreight * 0.08); // 8% loyalty rebate
    else if (volumeRatio < 1.0) volumeAdjustment = (rawFreight * 0.12 * (1 - volumeRatio)); // Shortfall penalty
  }

  // 5. SLA Handling
  let slaPenalty = 0;
  let slaStatus = 'COMPLIANT';
  if (config.sla?.maxTransitDays > 0 && route.totalTimeDays > config.sla.maxTransitDays) {
    const delayDays = route.totalTimeDays - config.sla.maxTransitDays;
    slaPenalty = delayDays * (config.sla.penaltyPerDayDelay || 200);
    slaStatus = 'BREACH';
  }

  // 6. Risk Exposure (Strategic coverage)
  let disruptionExposure = rawDisruptionCost;
  if (config.disruptionClause === 'carrier_absorbs') {
    disruptionExposure = rawDisruptionCost * 0.25; // 75% coverage
  } else if (config.disruptionClause === 'shared') {
    disruptionExposure = rawDisruptionCost * 0.55; 
  }

  // 7. Assembler
  const basePrice = Math.round(rawFreight * contractMultiplier);
  const fuelAdjust = config.fuelAdjustmentEnabled ? (baseFuel * (1 + (config.fuelPercentage || 3) / 100)) : baseFuel;
  
  // Apply the same contract multiplier to the commercial adjustments (Fuel/Handling) to make the discount "All In"
  let pricingAdjustment = Math.round((fuelAdjust + carrier.fixedHandlingFee + volumeAdjustment) * contractMultiplier - slaPenalty);
  pricingAdjustment = Math.max(0, pricingAdjustment);

  const finalCost = basePrice + Math.round(disruptionExposure) + pricingAdjustment + fixedHandling;

  return {
    carrierId: carrier.id,
    carrierName: carrier.name,
    pricingModeUsed: 'contract',
    pricingMode: 'spot',
    contractApplied: true,
    SLAStatus: slaStatus,
    baseCost: basePrice,
    baseTechnicalCost: basePrice, 
    disruptionCost: Math.round(disruptionExposure),
    disruptionSurcharge: Math.round(disruptionExposure), 
    pricingAdjustment: pricingAdjustment,
    commercialAdjustment: pricingAdjustment, 
    finalCost: finalCost
  };
}

module.exports = { calculateRoutePricing };
