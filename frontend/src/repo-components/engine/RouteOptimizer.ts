import { CARRIERS, HUBS } from '../data/logisticsData';
import type { Hub, Carrier } from '../data/logisticsData';
import { RiskModeler } from './RiskModeler';
import type { RiskScore, ShipmentParams } from './RiskModeler';
import { CustomsEngine } from './CustomsEngine';
import { DisruptionEngine } from './DisruptionEngine';
import type { Disruption } from './DisruptionEngine';

export interface ShapValue {
  feature: string;
  impact: number;
  weight: number; 
  isPositive: boolean; 
}

export interface CostBreakdown {
  freight: number;
  duties: number;
  fuel: number;
  handling: number;
  carbonOffset?: number; // ESG Feature
  totalRange: [number, number];
  confidenceRating: number; 
  manifest: {
    freight: string[];
    duties: string[];
    fuel: string[];
    handling: string[];
    esg?: string[]; // ESG Feature
  };
}

export interface RouteSegment {
  mode: 'air' | 'sea' | 'rail' | 'road';
  from: Hub;
  to: Hub;
  carrier: Carrier;
  distance: number;
  timeDays: number;
  cost: number;
  risk: RiskScore;
  breakdown: CostBreakdown;
}

export interface Scenario {
  name: string;
  modality: 'AIR' | 'OCEAN' | 'ROAD' | 'RAIL' | 'MULTIMODAL';
  totalTime: number;
  totalCost: number;
  totalCostRange: [number, number];
  confidence: number;
  totalRisk: number;
  co2kg: number; // ESG Feature
  isNetZero: boolean; // ESG Feature
  segments: RouteSegment[];
  description: string;
  rationale: string;
  isRecommended?: boolean;
  slaViolation?: boolean;
  activeDisruptions: Disruption[];
  shapImportance: ShapValue[];
}

export class RouteOptimizer {
  static generateScenarios(
    params: ShipmentParams,
    origin: Hub,
    destination: Hub,
    realTimeSignals: { weather: number; news: number },
    chaosLevel: number = 0 // Chaos Simulation Feature
  ): Scenario[] {
    const distance = this.calculateDistance(origin.coordinates, destination.coordinates);
    const scenarios: Scenario[] = [];

    // Apply Chaos to signals
    const signals = {
      weather: Math.min(1, realTimeSignals.weather + (chaosLevel * 0.8)),
      news: Math.min(1, realTimeSignals.news + (chaosLevel * 0.9))
    };

    // 1. Expedited (Air)
    scenarios.push(this.createScenario('Option 1: Expedited', 'AIR', 'air', distance, params, origin, destination, signals, false, chaosLevel));
    
    // 2. Economical (Sea)
    scenarios.push(this.createScenario('Option 2: Economical', 'OCEAN', 'sea', distance, params, origin, destination, signals, false, chaosLevel));
    
    // 3. Strategic (High Safety / ESG Focus)
    scenarios.push(this.createScenario('Option 3: Strategic ESG', 'MULTIMODAL', 'sea', distance, params, origin, destination, signals, true, chaosLevel));
    
    // 4. Road (Surface)
    if (origin.country === destination.country || chaosLevel > 0.5) {
      scenarios.push(this.createScenario('Option 4: Tactical Surface', 'ROAD', 'road', distance, params, origin, destination, signals, false, chaosLevel));
    }

    // SLA Check & Recommendation
    const recommended = this.buildRecommendation(scenarios, params);
    scenarios.push(recommended);

    // AI Strategic Pivot for Rerouting
    const pivot = this.findStrategicPivot(params, origin, destination, signals, chaosLevel);
    if (pivot) scenarios.push(pivot);

    return scenarios.map(s => this.applySLA(s, params));
  }

  private static calculateDistance(coord1: [number, number], coord2: [number, number]): number {
    const R = 6371; // Earth radius in km
    const dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
    const dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(coord1[0] * Math.PI / 180) * Math.cos(coord2[0] * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  private static createScenario(
    name: string,
    modality: Scenario['modality'],
    mode: RouteSegment['mode'],
    distance: number,
    params: ShipmentParams,
    origin: Hub,
    destination: Hub,
    signals: { weather: number; news: number },
    isEsgFocus: boolean = false,
    chaosLevel: number = 0
  ): Scenario {
    const disruptionAnalysis = DisruptionEngine.analyzeRoute(origin, destination);
    
    let carrier: Carrier;
    if (mode === 'air') {
      carrier = CARRIERS.find(c => c.id === (isEsgFocus || disruptionAnalysis.isDisrupted ? 'dhl' : 'fedex')) || CARRIERS[0];
    } else if (mode === 'road') {
      carrier = CARRIERS.find(c => c.id === 'fedex') || CARRIERS[0];
    } else {
      carrier = CARRIERS.find(c => c.id === (isEsgFocus ? 'maersk' : 'cma')) || CARRIERS[2];
    }
    
    // TRANSIT DYNAMICS - Professional Deterministic Model
    const speedKmh = mode === 'air' ? 850 : (mode === 'sea' ? 35 : 85);
    const disruptionLatency = (disruptionAnalysis.isDisrupted ? (disruptionAnalysis.relevantDisruptions[0].severity * 8) : 0) * (1 + chaosLevel * 2);
    
    // Replace random jitter with deterministic calculation based on environmental signals
    const environmentalBuffer = (signals.weather * 1.5) + (chaosLevel * 2); 
    const baseTimeDays = (distance / speedKmh) / 24;
    const timeDays = Math.max(1, Math.round(baseTimeDays + environmentalBuffer + disruptionLatency));
    
    // ESG CALCULATIONS (Google Hackathon Feature)
    // Refined rates based on industry tkm (tonne-kilometer) standards
    const co2Rate = mode === 'air' ? 0.75 : (mode === 'sea' ? 0.015 : 0.12); // kg CO2 per tonne-km
    const rawCo2 = (params.weight / 1000) * distance * co2Rate;
    const isNetZero = isEsgFocus || mode === 'sea';
    const carbonOffset = isNetZero ? (rawCo2 * 0.15) : 0; // Credits cost

    // FINANCIALS — Distance × Weight × Mode Rate (real-world model)
    // Rates in $/tonne-km (converted from industry published rates)
    const manifestFreights: string[] = [];
    const manifestDuties: string[] = [];
    const ratePerKmTonne = mode === 'air'
      ? 4.50    // Air: ~$4-6/tonne-km (IATA published rates)
      : mode === 'road'
        ? 0.35  // Road: ~$0.30-0.45/tonne-km
        : 0.08; // Sea: ~$0.05-0.12/tonne-km

    const weightTonnes = Math.max(params.weight / 1000, 0.01);
    const chaosPremium = 1 + (chaosLevel * 0.5);

    // Base freight: distance × weight × rate
    const baseFreight = distance * weightTonnes * ratePerKmTonne * carrier.costRate * chaosPremium;

    // Minimum base handling charge per mode (airport/port fees, loading, etc.)
    const minimumBase = mode === 'air' ? 120 : mode === 'sea' ? 300 : 80;
    const freight = Math.max(baseFreight, minimumBase);

    manifestFreights.push(`${mode.toUpperCase()} Freight: $${ratePerKmTonne}/tonne-km × ${distance.toLocaleString()}km`);

    const customsResult = CustomsEngine.getDuty(params.itemType, origin, destination, params.cargoValue);
    manifestDuties.push(...customsResult.manifest);

    const insuranceRate = 0.005 + (chaosLevel * 0.02);
    const insurance = Math.max(25, params.cargoValue * insuranceRate);

    // Fuel surcharge: distance-proportional (longer = more fuel cost per kg)
    const fuelSurchargeRate = mode === 'air' ? 0.18 : mode === 'road' ? 0.12 : 0.06;
    const fuel = freight * fuelSurchargeRate * (1 + signals.weather);
    const handling = (mode === 'air' ? 95 : 140) + (params.isHazardous ? 250 : 0);
    
    const totalCost = freight + customsResult.duties + fuel + handling + insurance + carbonOffset;
    const confidence = Math.max(0.1, 0.95 - (signals.weather * 0.2) - (signals.news * 0.2) - (chaosLevel * 0.5));

    
    const risk = RiskModeler.calculateSegmentRisk(origin, destination, carrier, params, signals);
    
    const breakdown: CostBreakdown = {
      freight: Number(freight.toFixed(2)),
      duties: Number(customsResult.duties.toFixed(2)),
      fuel: Number(fuel.toFixed(2)),
      handling: Number((handling + insurance).toFixed(2)),
      carbonOffset: Number(carbonOffset.toFixed(2)),
      totalRange: [totalCost * 0.95, totalCost * 1.05],
      confidenceRating: confidence,
      manifest: {
        freight: manifestFreights,
        duties: manifestDuties,
        fuel: [`Weather Adjustment: +${(signals.weather*100).toFixed(0)}%`],
        handling: [
          `Insurance (${(insuranceRate*100).toFixed(1)}%): $${insurance.toFixed(2)}`,
          disruptionAnalysis.isDisrupted ? "Disruption Surcharge: $350" : "Network Stability: Fee Waived"
        ],
        esg: isNetZero ? [`Certified Net-Zero Asset`, `Carbon Credit Offset: $${carbonOffset.toFixed(2)}`] : [`High Emission Route`]
      }
    };

    const shapImportance: ShapValue[] = [
      { feature: 'Payload Factor', impact: freight/totalCost, weight: 0.8, isPositive: true },
      { feature: 'Geo-Vulnerability', impact: risk.geopolitical/100, weight: 0.9, isPositive: true },
      { feature: 'Climate Buffer', impact: risk.environmental/100, weight: 0.7, isPositive: true },
      { feature: 'Chaos Variance', impact: chaosLevel * 0.4, weight: chaosLevel, isPositive: true }
    ];

    return {
      name, modality, totalTime: Math.round(timeDays), totalCost,
      totalCostRange: [breakdown.totalRange[0], breakdown.totalRange[1]],
      confidence, totalRisk: risk.total, co2kg: rawCo2, isNetZero,
      segments: [{ mode, from: origin, to: destination, carrier, distance, timeDays, cost: totalCost, risk, breakdown }],
      description: isEsgFocus ? 'Green Tactical' : 'Standard Tactical',
      rationale: disruptionAnalysis.isDisrupted ? `Chaos Mitigation: ${disruptionAnalysis.mitigationStrategy}` : 'Optimized Path',
      activeDisruptions: disruptionAnalysis.relevantDisruptions,
      shapImportance
    };
  }

  private static applySLA(scenario: Scenario, params: ShipmentParams): Scenario {
    if (!params.deliveryDeadline) return scenario;
    const diffDays = (new Date(params.deliveryDeadline).getTime() - Date.now()) / (1000 * 3600 * 24);
    return { ...scenario, slaViolation: scenario.totalTime > diffDays };
  }

  private static buildRecommendation(scenarios: Scenario[], params: ShipmentParams): Scenario {
    const sorted = [...scenarios].sort((a, b) => {
      const score = (s: Scenario) => {
        const costW = params.priority === 'cost' ? 0.8 : 0.3;
        const timeW = params.priority === 'time' ? 0.8 : 0.3;
        const netZeroBonus = s.isNetZero ? -0.2 : 0;
        return (s.totalCost/10000)*costW + (s.totalTime/5)*timeW + netZeroBonus;
      };
      return score(a) - score(b);
    });
    return { ...sorted[0], name: 'AI SELECTION', isRecommended: true };
  }

  /**
   * ADVANCED ALGORITHM: Multi-hub pathfinding for rerouting.
   * Discovers alternative routes through global hubs to bypass active disruption zones.
   */
  static findStrategicPivot(
    params: ShipmentParams,
    origin: Hub,
    destination: Hub,
    signals: { weather: number; news: number },
    chaosLevel: number
  ): Scenario | null {
    const directAnalysis = DisruptionEngine.analyzeRoute(origin, destination);
    if (!directAnalysis.isDisrupted && chaosLevel < 0.3) return null;

    const candidates = HUBS.filter(h => h.id !== origin.id && h.id !== destination.id);
    let bestPivot: { hub: Hub, scenario: Scenario } | null = null;
    let minPenalty = Infinity;

    candidates.forEach(hub => {
      const leg1 = DisruptionEngine.analyzeRoute(origin, hub);
      const leg2 = DisruptionEngine.analyzeRoute(hub, destination);

      if (!leg1.isDisrupted && !leg2.isDisrupted) {
        const d1 = this.calculateDistance(origin.coordinates, hub.coordinates);
        const d2 = this.calculateDistance(hub.coordinates, destination.coordinates);
        const totalDist = d1 + d2;
        
        const scenario = this.createScenario(
          `Pivot via ${hub.city}`, 'MULTIMODAL', 'air', totalDist, params, origin, destination, signals, false, chaosLevel
        );

        const penalty = totalDist + (hub.congestionIndex * 1000);
        if (penalty < minPenalty) {
          minPenalty = penalty;
          bestPivot = { hub, scenario };
        }
      }
    });

    if (bestPivot) {
      const { hub, scenario } = bestPivot as any;
      return {
        ...scenario,
        name: 'STRATEGIC PIVOT',
        rationale: `GEMINI_PATHFINDER: Detected critical bottleneck. Rerouting via ${hub.city} [${hub.name}] to bypass disruption zones.`,
        isRecommended: true
      };
    }
    return null;
  }
}
