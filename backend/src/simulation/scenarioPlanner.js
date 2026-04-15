/**
 * Scenario Planner Orchestration Layer
 * Generates and compares multiple routing scenarios.
 */
const { generateRoutes } = require('../engines/routeOptimizationEngine');

/**
 * Filter disruptions for a specific scenario category
 */
function filterDisruptions(allDisruptions, scenarioId) {
  const sid = scenarioId.toLowerCase();
  
  if (sid === 'baseline') {
    return { activeDisruptions: [], excludeFixedZones: true };
  }
  
  if (sid === 'total-avoidance') {
    return { activeDisruptions: allDisruptions, excludeFixedZones: false };
  }

  const isWeatherScenario = sid.includes('weather');
  const isGeoScenario     = sid.includes('geopolitical');

  // Any threat mentioning these is strictly Weather
  const weatherKeywords = ['weather', 'natural', 'environmental', 'meteorological', 'storm', 'cyclone', 'typhoon', 'seismic', 'tsunami', 'nature', 'climate'];

  return {
    activeDisruptions: allDisruptions.filter(d => {
      const metadataStr = `${d.name || ''} ${d.type || ''} ${d.riskType || ''} ${d.category || ''}`.toLowerCase();
      const isWeather = weatherKeywords.some(kw => metadataStr.includes(kw));
      
      if (isWeatherScenario) return isWeather;
      if (isGeoScenario) return !isWeather; // Geo captures everything that isn't weather
      return false;
    }),
    excludeFixedZones: false,
    categoryFilterMembers: isWeatherScenario ? weatherKeywords : [] 
  };
}

/**
 * Plan all scenarios for a shipment
 */
function planScenarios(input, allDisruptions, fixedRiskZones) {
  const scenarioConfigs = [
    { id: 'baseline', label: 'Baseline', icon: '📍', description: 'Optimal route under perfect conditions (no active threats).' },
    { id: 'weather-aware', label: 'Weather-aware', icon: '⛈️', description: 'Meteorological intelligencepass: bypassing storms and cyclonic events.' },
    { id: 'geopolitical-aware', label: 'Geopolitical-aware', icon: '🌍', description: 'Strategic bypass of high-tension zones and conflict corridors.' },
    { id: 'total-avoidance', label: 'Aggregated Intel', icon: '🛡️', description: 'The Master Blueprint: Summation of all weather and geopolitical intelligence.' }
  ];

  const results = [];
  let baselineRoute = null;

  for (const config of scenarioConfigs) {
    const filter = filterDisruptions(allDisruptions, config.id);
    
    // For specific scenarios, we might also want to filter the FIXED risk zones
    let relevantFixed = fixedRiskZones;
    if (filter.excludeFixedZones) {
      relevantFixed = [];
    } else if (filter.categoryFilterMembers) {
      const weatherKws = ['weather', 'natural', 'environmental', 'meteorological', 'storm', 'cyclone', 'typhoon', 'seismic', 'tsunami', 'nature', 'climate'];
      const sid = config.id.toLowerCase();
      const isWeatherScenario = sid.includes('weather');
      const isGeoScenario = sid.includes('geopolitical');

      relevantFixed = fixedRiskZones.filter(z => {
        const metadataStr = `${z.name || ''} ${z.type || ''} ${z.riskType || ''} ${z.category || ''}`.toLowerCase();
        const isWeather = weatherKws.some(kw => metadataStr.includes(kw));
        
        if (isWeatherScenario) return isWeather;
        if (isGeoScenario) return !isWeather;
        return false;
      });
    }

    // Merge for the engine
    const combinedDisruptions = [...relevantFixed, ...filter.activeDisruptions];

    // Run engine
    const engineResult = generateRoutes(input, combinedDisruptions);
    
    // Pick the "Balanced" route as the representative (usually route index 3 in generateRoutes)
    const representative = engineResult.routes.find(r => r.id === 'balanced') || engineResult.routes[3];

    const result = {
      scenarioId: config.id,
      scenarioLabel: config.label,
      icon: config.icon,
      description: config.description,
      representativeRoute: representative,
      totalCost: representative.financials?.finalCost || representative.cost.total,
      totalTransitDays: representative.totalTimeDays,
      routeSegments: representative.displaySegments,
      relevantDisruptions: combinedDisruptions,
      disruptionExposureSummary: summarizeExposure(combinedDisruptions),
      addedCostVsBaseline: 0,
      addedDaysVsBaseline: 0,
      tradeoffExplanation: ''
    };

    if (config.id === 'baseline') {
      baselineRoute = result;
    }

    results.push(result);
  }

  // Calculate deltas and explanations relative to baseline
  results.forEach(res => {
    if (res.scenarioId !== 'baseline' && baselineRoute) {
      res.addedCostVsBaseline = res.totalCost - baselineRoute.totalCost;
      res.addedDaysVsBaseline = res.totalTransitDays - baselineRoute.totalTransitDays;
      res.tradeoffExplanation = generateTradeoffExplanation(res, baselineRoute);
    } else if (res.scenarioId === 'baseline') {
      res.tradeoffExplanation = 'Standard reference arrival and cost metrics.';
    }
  });

  return results;
}

function summarizeExposure(disruptions) {
  const summary = {};
  disruptions.forEach(d => {
    const cat = d.category || 'other';
    summary[cat] = (summary[cat] || 0) + 1;
  });
  
  const entries = Object.entries(summary);
  if (entries.length === 0) return 'No active threats detected in this scenario scope.';
  return entries.map(([cat, count]) => `${count} ${cat.charAt(0).toUpperCase() + cat.slice(1)} ${count === 1 ? 'risk' : 'risks'}`).join(', ');
}

function generateTradeoffExplanation(current, baseline) {
  const costDiff = current.addedCostVsBaseline;
  const dayDiff = current.addedDaysVsBaseline;
  
  let text = '';
  if (costDiff === 0 && dayDiff === 0) {
    text = `This scenario matches the baseline metrics as no ${current.scenarioId.split('-')[0]} threats were detected on the optimal path.`;
  } else {
    const reasons = [];
    if (costDiff > 0) reasons.push(`increased cost (+$${costDiff.toLocaleString()})`);
    if (dayDiff > 0) reasons.push(`extended transit (+${dayDiff} ${dayDiff === 1 ? 'day' : 'days'})`);
    
    const categoryName = current.scenarioId === 'total-avoidance' ? 'all combined' : current.scenarioId.split('-')[0];
    text = `Optimized to avoid ${categoryName} exposure, resulting in ${reasons.join(' and ')} to maintain safety margins.`;
  }
  return text;
}

module.exports = { planScenarios };
