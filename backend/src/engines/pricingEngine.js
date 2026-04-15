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
  
  // 1. Carrier selection
  const primaryMode = route.modes?.[0] || 'road'; 
  const carrier = CARRIERS.find(c => c.supportedModes.includes(primaryMode)) || CARRIERS[0];
  
  // Extract technical components
  const rawFreight = (route.cost.freight || 0) + (route.cost.customs || 0) + (route.cost.warehousing || 0) + (route.cost.insurance || 0);
  const baseFuel = route.cost.fuel || 0;
  const fixedHandling = route.cost.handling || 0;
  const rawDisruptionCost = route.extraCostFromDisruptions || 0;

  // LOGIC: CONTRACT MODE (Standard Partnership)
  if (pricingMode === 'contract' && contractConfig) {
    return calculateContractCost(route, contractConfig, carrier, rawDisruptionCost, rawFreight, baseFuel, fixedHandling);
  }

  // LOGIC: SPOT MODE (Market Premium)
  // Spot is now clearly more expensive (1.5x premium) representing on-demand urgency
  let spotMultiplier = 1.50; 
  
  const intensity = route.disruptionImpacts?.reduce((acc, imp) => {
     const weight = { 'High': 1.8, 'Medium': 1.3, 'Low': 1.1 }[imp.severity] || 1.0;
     return acc + weight;
  }, 0) || 0;
  
  spotMultiplier += (intensity * 0.08); 
  
  const basePrice = rawFreight * spotMultiplier;
  const pricingAdjustment = baseFuel + (carrier.fixedHandlingFee * 2.0); 
  
  const finalCost = basePrice + rawDisruptionCost + pricingAdjustment + fixedHandling;

  return {
    carrierId: carrier.id,
    carrierName: carrier.name,
    pricingModeUsed: 'spot',
    baseCost: Math.round(basePrice),
    baseTechnicalCost: Math.round(basePrice),
    disruptionCost: Math.round(rawDisruptionCost),
    disruptionSurcharge: Math.round(rawDisruptionCost),
    pricingAdjustment: Math.round(pricingAdjustment),
    commercialAdjustment: Math.round(pricingAdjustment),
    finalCost: Math.round(finalCost),
    SLAStatus: 'N/A'
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
