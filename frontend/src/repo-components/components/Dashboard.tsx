import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RouteOptimizer } from '../engine/RouteOptimizer';
import { useNewsData } from '../hooks/useNewsData';
import { TopSearchBar } from './TopSearchBar';
import { FilterSidebar } from './FilterSidebar';
import { RouteCard } from './RouteCard';
import { LiveMap } from './LiveMap';
import { HUBS } from '../data/logisticsData';
import type { ShipmentParams } from '../engine/RiskModeler';
import type { Scenario } from '../engine/RouteOptimizer';
import { ChevronDown, Map as MapIcon, X, Maximize2, ShieldAlert, Zap, Filter, Handshake } from 'lucide-react';
import { ContractConfigPanel } from './ContractConfigPanel';

import MapVisualization from '../../components/MapVisualization';
import axios from 'axios';

import { RiskAlertsView } from './RiskAlertsView';
import { CostBreakdownView } from './CostBreakdownView';
import { OverviewView } from './OverviewView';
import { useCurrency } from '../hooks/useCurrency';
import { motion, AnimatePresence } from 'framer-motion';
import { ShapExplainabilityView } from './ShapExplainabilityView';
import '../dashboard-layout.css';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'ROUTING' | 'OVERVIEW' | 'NETWORK' | 'EXPLAIN' | 'RISKS' | 'COST'>('ROUTING');
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isContractOpen, setIsContractOpen] = useState(false);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState<number>(0);

  
  const [params, setParams] = useState<ShipmentParams>({
    itemType: 'electronics',
    weight: 15,
    cargoValue: 500,
    sensitivity: 0.6,
    isHazardous: false,
    priority: 'balanced',
    originCity: 'Delhi',
    originCountry: 'IN',
    originHub: HUBS.find(h => h.city === 'Delhi') || HUBS[0],
    destCity: 'Los Angeles',
    destCountry: 'USA',
    destHub: HUBS.find(h => h.city === 'Los Angeles') || HUBS[1],
    deliveryDeadline: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().split('T')[0]
  });

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [filteredScenarios, setFilteredScenarios] = useState<Scenario[]>([]);
  const [sortBy, setSortBy] = useState<'BEST' | 'CHEAPEST' | 'FASTEST' | 'LOWEST_RISK'>('BEST');
  const [budgetRange, setBudgetRange] = useState<[number, number]>([100, 5000000]);
  const [filters, setFilters] = useState({
    modes: ['AIR', 'OCEAN', 'ROAD', 'MULTIMODAL'],
    speed: 'all',
    risk: 'HIGH'
  });

  const { signals: newsSignals, globalGeopolRisk } = useNewsData();
  const { convert, currency } = useCurrency();

  const [chaosLevel, setChaosLevel] = useState(0); // 0 to 1
  const [strategicScenarios, setStrategicScenarios] = useState<any[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string>('baseline');
  const [mapPreviewMode, setMapPreviewMode] = useState<'STRATEGIC' | 'TACTICAL'>('STRATEGIC');
  const [showDisruptions, setShowDisruptions] = useState(true);
  const [pricingMode, setPricingMode] = useState<'contract' | 'spot'>('spot');
  const [contractConfig, setContractConfig] = useState<any>({
    rateType: 'fixed',
    baseRateOverride: 0.9,
    volumeCommitment: 100,
    currentVolume: 85,
    disruptionClause: 'shared',
    sla: { maxTransitDays: 12, penaltyPerDayDelay: 200 },
    reservedUnitsPerWeek: 50,
    fuelAdjustmentEnabled: true,
    fuelPercentage: 3,
    pricingTiers: [
      { threshold: 100, rate: 0.95 },
      { threshold: 500, rate: 0.85 },
      { threshold: 2000, rate: 0.75 }
    ]
  });





  const handleSearch = async (options?: { isManual?: boolean, shouldResetSelection?: boolean, pricingModeOverride?: 'contract' | 'spot', contractConfigOverride?: any, scenarioIdOverride?: string }) => {
    // Determine the absolute ground-truth pricing mode for this search
    const currentPricingMode = options?.pricingModeOverride || pricingMode;
    const currentContractConfig = options?.contractConfigOverride || contractConfig;

    const cargoValueUsd = convert(params.cargoValue || 0, currency.code, 'USD');
    try {
      const payload = {
        origin: params.originCity.toLowerCase(),
        destination: params.destCity.toLowerCase(),
        itemType: params.itemType,
        weight: params.weight,
        priorityMode: params.priority,
        deadline: params.deliveryDeadline,
        pricingMode: currentPricingMode,
        contractConfig: currentContractConfig,
      };

      // 1. Fetch Strategic Comparison Scenarios
      const scenarioRes = await axios.post('/api/routes/scenarios', payload).catch(err => ({ data: { scenarios: [] } }));
      const currentScenariosLabels = scenarioRes.data.scenarios || [];
      setStrategicScenarios(currentScenariosLabels);

      // 2. Identify the active disruption landscape
      const targetScenarioId = options?.scenarioIdOverride || activeScenarioId || 'total-avoidance';
      const activeContext = currentScenariosLabels.find((s: any) => s.scenarioId === targetScenarioId) || currentScenariosLabels[0];
      const targetDisruptions = activeContext?.relevantDisruptions || [];

      // 3. Fetch Tactical Route Vectors
      const res = await axios.post('/api/routes', { ...payload, disruptions: targetDisruptions });
      const backendRoutes = res.data.routes || [];
      
      setActiveScenarioId(targetScenarioId);
      setMapPreviewMode('TACTICAL'); 

      // 4. Force UI Sync
      let baseScenarios = RouteOptimizer.generateScenarios(
        { ...params, cargoValue: cargoValueUsd },
        params.originHub || HUBS[0],
        params.destHub || HUBS[1],
        { weather: 0.15, news: globalGeopolRisk },
        chaosLevel
      );



      // Merge backend itinerary into scenarios
      const mergedScenarios = baseScenarios.slice(0, backendRoutes.length).map((scenario, i) => {
        const targetId = i === 0 ? 'fastest'     // Expedited (Air)
                       : i === 1 ? 'cheapest'    // Economical (Sea)
                       : i === 2 ? 'lowest_risk' // Strategic 1
                       : 'balanced';             // Tactical Surface
        const bRoute = backendRoutes.find((r: any) => r.id === targetId) || backendRoutes[i];
        const financialData = bRoute.financials || {};
        
        let modality = scenario.modality;
        if (bRoute.modes) {
          if (bRoute.modes.length > 1) modality = 'MULTIMODAL';
          else if (bRoute.modes[0] === 'air') modality = 'AIR';
          else if (bRoute.modes[0] === 'sea') modality = 'OCEAN';
          else modality = 'ROAD';
        }

        const segments = [...scenario.segments];
        if (segments[0] && bRoute.cost) {
          segments[0] = {
            ...segments[0],
            carrier: { name: bRoute.carrierName || 'Global Logistic' },
            cost: bRoute.cost.total,
            breakdown: {
              ...segments[0].breakdown,
              freight: bRoute.cost.freight,
              fuel: bRoute.cost.fuel,
              handling: (bRoute.cost.handling || 0) + (bRoute.cost.extraCostFromDisruptions || 0),
              duties: bRoute.cost.customs || 0,
              totalRange: [bRoute.totalCost * 0.98, bRoute.totalCost * 1.02],
              manifest: {
                ...segments[0].breakdown.manifest,
                freight: [`Base Benchmark Rate: $${(bRoute.cost.freight || 0).toLocaleString()}`],
                fuel: [`Market Fuel Surcharge: $${(bRoute.cost.fuel || 0).toLocaleString()}`],
                handling: [`Ops & Risk Surcharge: $${((bRoute.cost.handling || 0) + (bRoute.cost.extraCostFromDisruptions || 0)).toLocaleString()}`],
                duties: [`Est. Regional Customs: $${(bRoute.cost.customs || 0).toLocaleString()}`]
              }
            }
          };
        }

        return {
          ...scenario,
          name: bRoute.name,
          description: bRoute.description,
          rationale: bRoute.decision?.reasoning || 'Optimized logistical corridor identified.',
          co2kg: bRoute.totalCarbonKg || 0,
          totalTime: bRoute.totalTimeDays,
          totalCost: bRoute.financials?.finalCost || bRoute.totalCost || bRoute.cost?.total || scenario.totalCost,
          totalCostRange: bRoute.financials?.finalCost 
            ? [bRoute.financials.finalCost * 0.98, bRoute.financials.finalCost * 1.02] 
            : scenario.totalCostRange,
          modality,
          segments,
          uiTag: bRoute.id === 'fastest' ? 'Fastest' : 
                 bRoute.id === 'cheapest' ? 'Cheapest' : 
                 bRoute.id === 'balanced' ? 'Recommended' : 
                 bRoute.id === 'lowest_risk' ? 'Balanced' : null,
          isRecommended: bRoute.recommended,
          backendRoute: bRoute 
        };
      });

      setScenarios(mergedScenarios);
      if (options?.shouldResetSelection) {
        setSelectedRouteIdx(0);
      }
      if (options?.isManual) {
        setActiveTab('ROUTING');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeploy = async (scenario: Scenario, isHold: boolean = false) => {
    try {
      await axios.post('/api/simulate/start', {
        input: {
          origin: params.originCity.toLowerCase(),
          destination: params.destCity.toLowerCase(),
          itemType: params.itemType,
          weight: params.weight,
          priorityMode: params.priority,
          deadline: params.deliveryDeadline
        },
        selectedRouteId: scenario.backendRoute?.id,
        isHoldSimulation: isHold
      });
      navigate('/simulation');
    } catch (err) {
      console.error('Failed to deploy shipment:', err);
      alert('Failed to deploy shipment. Please check console for details.');
    }
  };

  // Load routes once on mount only — subsequent updates only happen on explicit Search
  useEffect(() => {
    handleSearch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMapExpanded(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);


  useEffect(() => {
    let result = [...scenarios];
    result = result.filter(s => filters.modes.includes(s.modality));
    result = result.filter(s => s.totalCost <= budgetRange[1]);
    if (filters.speed === 'fast') result = result.filter(s => s.totalTime < 5);
    else if (filters.speed === 'mid') result = result.filter(s => s.totalTime >= 5 && s.totalTime <= 15);

    result.sort((a, b) => {
      if (sortBy === 'CHEAPEST') return a.totalCost - b.totalCost;
      if (sortBy === 'FASTEST') return a.totalTime - b.totalTime;
      if (sortBy === 'LOWEST_RISK') return a.totalRisk - b.totalRisk;
      return 0; // BEST is handled by engine isRecommended
    });

    setFilteredScenarios(result);
  }, [scenarios, filters, budgetRange, sortBy]);

  const tabs = [
    { id: 'ROUTING', label: 'Tactical Routing' },
    { id: 'OVERVIEW', label: 'Control Center' },
    { id: 'EXPLAIN', label: 'ML Explainability' },
    { id: 'RISKS', label: 'Preemptive Risks' },
    { id: 'COST', label: 'Financial Ledger' }
  ];

  return (
    <div className="dashboard-container">
      {/* GLOBAL HEADER: SEARCH */}
      <div style={{ position: 'relative', zIndex: 1000 }}>
        <TopSearchBar 
          params={params} 
          setParams={setParams} 
          onSearch={() => handleSearch({ isManual: true, shouldResetSelection: true })} 
        />
      </div>
      
      {/* TABS NAVIGATION */}
      <div style={{ display: 'flex', background: 'var(--bg-deep)', padding: '0 40px', borderBottom: '1px solid var(--border-dim)', gap: 32 }}>
        {tabs.map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="main-layout" style={{ gridTemplateColumns: '1fr 480px', paddingTop: 0 }}>
        {/* CENTER CONTENT: RESULTS / ANALYTICS */}
        <main className="content-panel" style={{ padding: '24px 40px' }}>
          {activeTab === 'ROUTING' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700 }}>Active Tactical Vectors</h2>
                </div>
                
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* PRICING TOGGLE */}
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 4, border: '1px solid var(--border-dim)' }}>
                    <button 
                      onClick={() => { setPricingMode('contract'); handleSearch({ isManual: true, pricingModeOverride: 'contract' }); }}
                      style={{ 
                        padding: '4px 12px', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                        background: pricingMode === 'contract' ? 'var(--accent-primary)' : 'transparent',
                        color: pricingMode === 'contract' ? '#000' : 'var(--text-muted)',
                        border: 'none', transition: 'all 0.2s'
                      }}
                    >
                      CONTRACT
                    </button>
                    <button 
                      onClick={() => { setPricingMode('spot'); handleSearch({ isManual: true, pricingModeOverride: 'spot' }); }}
                      style={{ 
                        padding: '4px 12px', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                        background: pricingMode === 'spot' ? '#f59e0b' : 'transparent',
                        color: pricingMode === 'spot' ? '#000' : 'var(--text-muted)',
                        border: 'none', transition: 'all 0.2s'
                      }}
                    >
                      SPOT
                    </button>
                  </div>



                  {/* Procurement / Contract Dropdown */}
                  {pricingMode === 'contract' && (
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setIsContractOpen(!isContractOpen)} className="dropdown-item" style={{ width: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--accent-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Handshake size={14} color="var(--accent-primary)" /> {isContractOpen ? 'Close Contract' : 'Contract Procurement'}
                      </button>
                      {isContractOpen && (
                        <div className="dropdown-panel" style={{ width: 400, right: 0, left: 'auto', padding: 12, overflow: 'hidden', border: '1px solid var(--accent-primary)', zIndex: 9999 }}>
                            <ContractConfigPanel 
                              config={contractConfig} 
                              setConfig={setContractConfig} 
                              onApply={(latest: any) => { 
                                setIsContractOpen(false); 
                                handleSearch({ isManual: true, contractConfigOverride: latest }); 
                              }} 
                            />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Filters Dropdown */}
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="dropdown-item" style={{ width: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-bright)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Filter size={14} color="var(--accent-emerald)" /> {isFilterOpen ? 'Close Settings' : 'Configuration'}
                    </button>

                    {isFilterOpen && (
                      <div className="dropdown-panel" style={{ width: 340, right: 0, left: 'auto', padding: 0, overflow: 'hidden', border: '1px solid var(--border-bright)', zIndex: 9999 }}>
                        <div style={{ padding: 24, background: 'var(--bg-surface)', maxHeight: '70vh', overflowY: 'auto' }}>
                          <FilterSidebar 
                            budget={budgetRange} 
                            setBudget={setBudgetRange} 
                            filters={filters} 
                            setFilters={setFilters}
                            params={params}
                            setParams={setParams}
                            onRecalculate={() => handleSearch({ isManual: true, shouldResetSelection: true })}
                            onClose={() => setIsFilterOpen(false)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Matrix Sort Dropdown */}
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setIsSortOpen(!isSortOpen)} className="dropdown-item" style={{ width: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-bright)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      Matrix Sort: <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{sortBy}</span>
                      <ChevronDown size={14} />
                    </button>
                    {isSortOpen && (
                      <div className="dropdown-panel" style={{ width: 220, right: 0, left: 'auto' }}>
                      {['BEST', 'CHEAPEST', 'FASTEST', 'LOWEST_RISK'].map(s => (
                        <button key={s} onClick={() => { setSortBy(s as any); setIsSortOpen(false); }} className={`dropdown-item ${sortBy === s ? 'active' : ''}`}>
                          {s === 'LOWEST_RISK' ? 'Lowest Risk' : s.charAt(0) + s.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* STRATEGIC SCENARIO SELECTOR */}


              {strategicScenarios.length > 0 && (
                <div style={{ marginBottom: 40 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <ShieldAlert size={18} color="var(--accent-primary)" />
                    <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 800, color: 'var(--text-secondary)' }}>Intelligent Simulation Scenarios</h3>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>

                    {strategicScenarios.map((scenario) => (
                      <button
                        key={scenario.scenarioId}
                        onClick={() => {
                          setActiveScenarioId(scenario.scenarioId);
                          setMapPreviewMode('STRATEGIC');
                          // Trigger re-search with the specific scenario's disruptions
                          handleSearch({ scenarioIdOverride: scenario.scenarioId });
                        }}
                        className={`card ${activeScenarioId === scenario.scenarioId && mapPreviewMode === 'STRATEGIC' ? 'active' : ''}`}

                        style={{ 
                          padding: '16px 12px', 
                          textAlign: 'left', 
                          background: activeScenarioId === scenario.scenarioId ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-card)',
                          borderColor: activeScenarioId === scenario.scenarioId ? 'var(--accent-primary)' : 'var(--border-dim)',
                          cursor: 'pointer',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 18 }}>{scenario.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{scenario.scenarioLabel}</span>
                        </div>
                        
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, height: 32, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {scenario.description}
                        </div>

                        {scenario.scenarioId === 'baseline' && (
                          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginTop: 4 }}>
                            REFERENCE POINT
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {activeScenarioId !== 'baseline' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ 
                        marginTop: 12, 
                        padding: '10px 16px', 
                        background: 'rgba(255,255,255,0.02)', 
                        border: '1px solid var(--border-dim)', 
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12
                      }}
                    >
                      <ShieldAlert size={14} color="var(--accent-primary)" />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                        <strong style={{ color: 'var(--accent-primary)' }}>Tradeoff Insight:</strong> {strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.tradeoffExplanation}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {filteredScenarios.length > 0 ? (
                  filteredScenarios.map((s, idx) => (
                    <div key={s.name} onClick={() => {
                      setSelectedRouteIdx(idx);
                      setMapPreviewMode('TACTICAL');
                    }}>
                      <RouteCard 
                        scenario={s} 
                        index={idx} 
                        isActive={idx === selectedRouteIdx && mapPreviewMode === 'TACTICAL'} 
                        onDeploy={() => handleDeploy(s)}
                      />
                    </div>
                  ))

                ) : (
                  <div className="card" style={{ textAlign: 'center', padding: '120px 40px', background: 'transparent', borderStyle: 'dashed' }}>
                     <Zap size={48} color="var(--border-bright)" style={{ marginBottom: 24 }} />
                     <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>No logistics paths available for this mission.</div>
                     <button onClick={() => setFilters({ modes: ['AIR', 'OCEAN', 'ROAD'], speed: 'all', risk: 'HIGH' })} style={{ color: 'var(--accent-primary)', background: 'none', border: 'none', marginTop: 16, cursor: 'pointer', fontWeight: 700 }}>Reset Filters</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ animation: 'fadeIn 0.3s', height: '100%' }}>
              {activeTab === 'EXPLAIN' && <ShapExplainabilityView scenarios={scenarios} />}
              {activeTab === 'RISKS' && <RiskAlertsView scenarios={scenarios} news={newsSignals} globalRisk={globalGeopolRisk} />}
              {activeTab === 'COST' && <CostBreakdownView scenarios={scenarios} />}
              {activeTab === 'OVERVIEW' && <OverviewView scenarios={filteredScenarios} origin={params.originCity} dest={params.destCity} />}
            </div>
          )}
        </main>
        {/* RIGHT SIDEBAR: INSIGHTS & MAP */}
        <aside className="insights-panel" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0 }}>
          <div style={{ padding: 24, paddingBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MapIcon size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 800 }}>Scenario Projection</h3>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  onClick={() => setShowDisruptions(!showDisruptions)}
                  style={{ 
                    background: showDisruptions ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
                    border: `1px solid ${showDisruptions ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                    color: showDisruptions ? '#ef4444' : '#10b981',
                    fontSize: 10,
                    fontWeight: 900,
                    padding: '6px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <ShieldAlert size={12} /> {showDisruptions ? 'HIDE THREATS' : 'SHOW THREATS'}
                </button>
                <button 
                  onClick={() => setIsMapExpanded(true)} 
                  className="hover-bright"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-dim)', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700 }}
                >
                   <Maximize2 size={14} /> EXPAND
                </button>
              </div>

            </div>
            
            <div style={{ height: 480, width: '100%', background: '#000', borderRadius: 16, overflow: 'hidden', position: 'relative', border: '1px solid var(--border-bright)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
               {mapPreviewMode === 'STRATEGIC' && activeScenarioId && strategicScenarios.find(s => s.scenarioId === activeScenarioId) ? (
                  <MapVisualization 
                    selectedRoute={strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.representativeRoute} 
                    activeDisruptions={showDisruptions ? (strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.relevantDisruptions) : []}
                    hitZones={showDisruptions ? (strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.representativeRoute?.risk?.hitZones || []) : []}
                    center={[
                      (strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.representativeRoute?.displaySegments?.[0]?.points?.[0]?.lat || 0), 
                      (strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.representativeRoute?.displaySegments?.[0]?.points?.[0]?.lng || 0)
                    ]}
                    zoom={2}
                    interactive={true}
                  />
               ) : filteredScenarios[selectedRouteIdx]?.backendRoute ? (
                  <MapVisualization 
                    selectedRoute={filteredScenarios[selectedRouteIdx].backendRoute} 
                    activeDisruptions={showDisruptions ? (strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.relevantDisruptions || []) : []}
                    hitZones={showDisruptions ? (filteredScenarios[selectedRouteIdx]?.backendRoute?.risk?.hitZones || []) : []}
                    center={[
                      (filteredScenarios[selectedRouteIdx].backendRoute.itinerary?.[0]?.lat || 0), 
                      (filteredScenarios[selectedRouteIdx].backendRoute.itinerary?.[0]?.lng || 0)
                    ]}
                    zoom={2}
                    interactive={true}
                  />


               ) : (
                  <div style={{color: 'white', display:'flex',height:'100%',alignItems:'center',justifyContent:'center', background: 'var(--bg-deep)'}}>
                    <div style={{ textAlign: 'center' }}>
                      <Zap size={32} color="var(--border-dim)" style={{ marginBottom: 12 }} />
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Synchronizing Map...</div>
                    </div>
                  </div>
               )}
            </div>
          </div>



          <div style={{ 
            padding: 20, 
            background: (filteredScenarios[selectedRouteIdx]?.backendRoute?.interruptedZones?.length || 0) > 0 ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)', 
            borderRadius: 12, 
            border: `1px solid ${(filteredScenarios[selectedRouteIdx]?.backendRoute?.interruptedZones?.length || 0) > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}` 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <ShieldAlert size={16} color={(filteredScenarios[selectedRouteIdx]?.backendRoute?.interruptedZones?.length || 0) > 0 ? '#ef4444' : 'var(--accent-primary)'} />
              <div style={{ fontSize: 11, fontWeight: 900 }}>SYSTEM INTEGRITY</div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              { (filteredScenarios[selectedRouteIdx]?.backendRoute?.interruptedZones?.length || 0) > 0 ? (
                <>Corridor compromised. Detected <strong>{(filteredScenarios[selectedRouteIdx]?.backendRoute?.interruptedZones?.length)}</strong> active threats intersecting the primary logistics path from {params.originCity} to {params.destCity}.</>
              ) : (
                <>Route stability identified. Corridor from {params.originCity} to {params.destCity} is currently observing <strong>Nominal</strong> activity.</>
              )}
            </p>
          </div>

        </aside>
      </div>

      {/* FULL MAP MODAL */}
      <AnimatePresence>
        {isMapExpanded && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', borderRadius: 24, overflow: 'hidden' }}>
               <button 
                 onClick={() => setIsMapExpanded(false)} 
                 style={{ 
                   position: 'absolute', 
                   top: 32, 
                   right: 32, 
                   zIndex: 100000, 
                   background: 'rgba(15, 23, 42, 0.8)', 
                   backdropFilter: 'blur(8px)',
                   border: '1px solid var(--border-bright)', 
                   borderRadius: '12px', 
                   padding: '10px 20px', 
                   color: '#fff', 
                   cursor: 'pointer',
                   display: 'flex',
                   alignItems: 'center',
                   gap: 8,
                   boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                   fontWeight: 700,
                   fontSize: 12,
                   letterSpacing: 1
                 }}
               >
                 <X size={18} /> ESC / CLOSE MAP
               </button>
               {mapPreviewMode === 'STRATEGIC' && activeScenarioId && strategicScenarios.find(s => s.scenarioId === activeScenarioId) ? (
                 <MapVisualization 
                   selectedRoute={strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.representativeRoute} 
                   activeDisruptions={showDisruptions ? (strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.relevantDisruptions || []) : []}
                   hitZones={showDisruptions ? (strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.representativeRoute?.risk?.hitZones || []) : []}
                   center={[
                     (strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.representativeRoute?.displaySegments?.[0]?.points?.[0]?.lat || 0), 
                     (strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.representativeRoute?.displaySegments?.[0]?.points?.[0]?.lng || 0)
                   ]}
                   zoom={3}
                   interactive={true}
                 />
               ) : filteredScenarios[selectedRouteIdx]?.backendRoute && (
                 <MapVisualization 
                   selectedRoute={filteredScenarios[selectedRouteIdx].backendRoute} 
                   activeDisruptions={strategicScenarios.find(s => s.scenarioId === activeScenarioId)?.relevantDisruptions || []}
                   hitZones={showDisruptions ? (filteredScenarios[selectedRouteIdx]?.backendRoute?.risk?.hitZones || []) : []}
                   center={[
                     (filteredScenarios[selectedRouteIdx].backendRoute.itinerary?.[0]?.lat || 0), 
                     (filteredScenarios[selectedRouteIdx].backendRoute.itinerary?.[0]?.lng || 0)
                   ]}
                   zoom={3}
                   interactive={true}
                 />
               )}

            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
