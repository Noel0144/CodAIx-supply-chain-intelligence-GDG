import React, { useState } from 'react';
import { Truck, Ship, Plane, Clock, ShieldCheck, ChevronDown, ChevronUp, AlertTriangle, MapPin, TrendingUp, Cpu, Activity, Zap } from 'lucide-react';
import type { Scenario, RouteSegment } from '../engine/RouteOptimizer';
import { useCurrency } from '../hooks/useCurrency';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  scenario: Scenario;
  index: number;
  isActive?: boolean;
  onDeploy?: () => void;
}

export const RouteCard: React.FC<Props> = ({ scenario, index, isActive, onDeploy }) => {
  const { format, naturalize } = useCurrency();
  const [isExpanded, setIsExpanded] = useState(false);

  const getCarrierIcon = (mode: RouteSegment['mode']) => {
    switch (mode) {
      case 'air': return <Plane size={20} color="var(--accent-cyan)" />;
      case 'sea': return <Ship size={20} color="var(--accent-primary)" />;
      default: return <Truck size={20} color="var(--accent-emerald)" />;
    }
  };

  const tag = (scenario as any).uiTag || (scenario.isRecommended ? 'Recommended' : 
              index === 0 ? 'Best Value' : 
              scenario.totalTime < 5 ? 'Fastest' : null);

  const bRoute = (scenario as any).backendRoute || (scenario as any).representativeRoute || scenario;
  const pricingModeUsed = bRoute?.financials?.pricingModeUsed || bRoute?.pricingModeUsed || 'spot';
  const disruptionImpacts = bRoute?.disruptionImpacts || [];
  const hasImpacts = disruptionImpacts.length > 0;

  return (
    <div className={`route-card ${isExpanded ? 'active' : ''}`} onClick={() => setIsExpanded(!isExpanded)} style={{ boxShadow: isActive ? 'inset 0 0 0 2px var(--accent-primary)' : 'none', border: '1px solid var(--border-dim)', position: 'relative' }}>
      {tag && (
        <div style={{ position: 'absolute', top: 0, right: 24, padding: '6px 16px', background: tag === 'Recommended' ? 'var(--accent-emerald)' : 'var(--accent-primary)', fontSize: 10, fontWeight: 800, color: '#fff', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, zIndex: 10 }}>
          {tag.toUpperCase()}
        </div>
      )}
      
      {hasImpacts && (
        <div style={{ position: 'absolute', top: -6, left: -6, zIndex: 100 }}>
           <div className="pulse-red" style={{ width: 14, height: 14, background: '#ef4444', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 15px #ef4444' }} />
        </div>
      )}

      {hasImpacts && (
        <div style={{ position: 'absolute', top: 0, left: 100, padding: '4px 10px', background: 'rgba(239, 68, 68, 0.9)', borderBottomLeftRadius: 6, borderBottomRightRadius: 6, zIndex: 10, color: 'white', fontSize: 8, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          <AlertTriangle size={10} /> THREAT DETECTED ({disruptionImpacts.length})
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 120px 160px 40px', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {getCarrierIcon(scenario.segments[0].mode)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{scenario.segments[0].carrier?.name || 'Carrier'}</div>
              <div style={{ 
                fontSize: 9, 
                fontWeight: 900, 
                background: pricingModeUsed === 'spot' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(99, 102, 241, 0.1)', 
                color: pricingModeUsed === 'spot' ? '#f59e0b' : 'var(--accent-primary)',
                padding: '2px 6px',
                borderRadius: 4,
                border: `1px solid ${pricingModeUsed === 'spot' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(99, 102, 241, 0.2)'}`,
                letterSpacing: 0.5,
                textTransform: 'uppercase'
              }}>
                {pricingModeUsed === 'contract' 
                  ? `${bRoute?.financials?.contractApplied ? 'Partnership' : 'Fixed'} Contract` 
                  : 'Spot Market'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{scenario.modality} Freight Service</div>
              {hasImpacts ? (
                <div style={{ fontSize: 8, fontWeight: 900, color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '1px 5px', borderRadius: 4, border: '1px solid rgba(239, 68, 68, 0.2)' }}>CORRIDOR COMPROMISED</div>
              ) : (
                <div style={{ fontSize: 8, fontWeight: 900, color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)', padding: '1px 5px', borderRadius: 4, border: '1px solid rgba(16, 185, 129, 0.2)' }}>STATUS: NOMINAL</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            <Clock size={16} color="var(--text-secondary)" />
            <span style={{ fontSize: 20, fontWeight: 700 }}>{scenario.totalTime}d</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Transit Time</div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{format(scenario.totalCost)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            {pricingModeUsed === 'contract' ? <Zap size={10} color="var(--accent-primary)" /> : <Activity size={10} color="#f59e0b" />}
            {pricingModeUsed.toUpperCase()} BILLING
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ marginTop: 24 }}>
              {/* BLOOMBERG STYLE: AUTONOMOUS DECISION INTELLIGENCE PANEL */}
              {hasImpacts && (scenario as any).backendRoute?.decision && (
                <div style={{ position: 'relative', marginBottom: 32, borderRadius: 12, overflow: 'hidden' }}>
                    <div className="intelligence-glow" style={{ position: 'absolute', inset: 0, background: (scenario as any).backendRoute.decision.recommendation === 'HOLD' ? 'var(--accent-primary)' : 'var(--accent-emerald)', opacity: 0.1, filter: 'blur(30px)' }} />
                    <div style={{ 
                        padding: 24, 
                        background: 'rgba(10, 15, 25, 0.6)',
                        border: `1px solid ${(scenario as any).backendRoute.decision.recommendation === 'HOLD' ? 'rgba(99, 102, 241, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                        borderRadius: 12,
                        backdropFilter: 'blur(10px)',
                        position: 'relative',
                        zIndex: 2,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <Cpu size={20} color={(scenario as any).backendRoute.decision.recommendation === 'HOLD' ? 'var(--accent-primary)' : 'var(--accent-emerald)'} style={{ filter: 'drop-shadow(0 0 8px currentColor)' }} />
                            <h4 style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Autonomous Decision Intelligence</h4>
                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Activity size={14} color="var(--accent-cyan)" />
                                <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent-cyan)', letterSpacing: 1 }}>LIVE RADAR ACTIVE</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>System Prescription</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ fontSize: 24, fontWeight: 900, color: (scenario as any).backendRoute?.decision?.recommendation === 'HOLD' ? 'var(--accent-primary)' : 'var(--accent-emerald)', textShadow: '0 0 20px currentColor' }}>
                                        {(scenario as any).backendRoute?.decision?.recommendation || 'UNKNOWN'}
                                    </div>
                                    <div style={{ fontSize: 10, fontWeight: 800, background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: 4 }}>STRATEGIC OVERRIDE</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Safe Action Hub</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                    <MapPin size={14} color="var(--text-muted)" />
                                    {(scenario as any).backendRoute?.holdOption?.nearestHub?.name || 'In Transit'}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 32 }}>
                            <div>
                                <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-bright)', marginBottom: 20, fontWeight: 500 }}>
                                    {(scenario as any).backendRoute?.decision?.reasoning || (scenario as any).backendRoute?.decision?.reason || 'Algorithmic evaluation pending execution...'}
                                </div>

                                <div className="risk-card risk-high" style={{ background: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <AlertTriangle size={16} color="var(--accent-rose)" />
                                        <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--accent-rose)', letterSpacing: 1 }}>DETECTION LOG: GEOSPATIAL THREATS</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {disruptionImpacts.map((d: any, i: number) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-rose)', boxShadow: '0 0 8px var(--accent-rose)' }} />
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                    <strong style={{ color: '#fff' }}>{d.name || d.category}</strong> disruption intersecting nominal path.
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ marginTop: 12 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        INDUSTRY BENCHMARK CONSTANT: $400/DAY WAREHOUSING
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ 
                                    padding: 16, 
                                    borderRadius: 8, 
                                    background: (scenario as any).backendRoute.decision.recommendation === 'HOLD' ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05))' : 'rgba(255,255,255,0.02)',
                                    border: (scenario as any).backendRoute.decision.recommendation === 'HOLD' ? '1px solid var(--accent-primary)' : '1px solid var(--border-dim)',
                                    position: 'relative'
                                }}>
                                    {(scenario as any).backendRoute?.decision?.recommendation === 'HOLD' && (
                                        <div style={{ position: 'absolute', top: -10, left: 16, background: 'var(--accent-primary)', color: '#000', fontSize: 9, fontWeight: 900, padding: '2px 8px', borderRadius: 4, letterSpacing: 1 }}>ALGORITHMIC WINNER</div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 4 }}>PROJECTED HOLD COST</div>
                                            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{format((scenario as any).backendRoute?.decision?.costComparison?.hold || 0)}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 4 }}>TEMPORAL DELAY</div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-cyan)' }}>+{(scenario as any).backendRoute?.decision?.timeComparison?.hold || 0} Days</div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ 
                                    padding: 16, 
                                    borderRadius: 8, 
                                    background: (scenario as any).backendRoute.decision.recommendation === 'REROUTE' ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))' : 'rgba(255,255,255,0.02)',
                                    border: (scenario as any).backendRoute.decision.recommendation === 'REROUTE' ? '1px solid var(--accent-emerald)' : '1px solid var(--border-dim)',
                                    position: 'relative'
                                }}>
                                    {(scenario as any).backendRoute?.decision?.recommendation === 'REROUTE' && (
                                        <div style={{ position: 'absolute', top: -10, left: 16, background: 'var(--accent-emerald)', color: '#000', fontSize: 9, fontWeight: 900, padding: '2px 8px', borderRadius: 4, letterSpacing: 1 }}>ALGORITHMIC WINNER</div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 4 }}>REROUTE PENALTY</div>
                                            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{format((scenario as any).backendRoute?.decision?.costComparison?.reroute || 0)}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 4 }}>TIME IMPACT</div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-orange)' }}>{((scenario as any).backendRoute?.decision?.timeComparison?.reroute || 0) > 0 ? `+${(scenario as any).backendRoute?.decision?.timeComparison?.reroute}` : '0'} Days</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
              )}

              <div style={{ paddingTop: 32, borderTop: '1px solid var(--border-dim)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
                <div>
                   <h5 style={{ fontSize: 12, fontWeight: 700, marginBottom: 20, color: '#fff' }}>Shipment Timeline</h5>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                     {((scenario as any).backendRoute?.itinerary ? (scenario as any).backendRoute.itinerary.map((step: any) => ({
                       step: step.event || `Transit via ${step.type}`,
                       time: `Day ${step.day}`
                     })) : [
                       { step: scenario.segments[0].from.city + ' Dispatch', time: 'Day 0' },
                       { step: 'Global Transit', time: 'Day 1-' + (scenario.totalTime - 1) },
                       { step: 'Customs Clearance', time: 'Day ' + (scenario.totalTime - 1) },
                       { step: scenario.segments[0].to.city + ' Delivery', time: 'Day ' + scenario.totalTime },
                     ]).map((step: any, i: number) => (
                       <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border-dim)', border: '2px solid var(--accent-primary)', flexShrink: 0 }} />
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{step.step}</div>
                          <div style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{step.time}</div>
                       </div>
                     ))}
                   </div>
                </div>

                <div>
                   <h5 style={{ fontSize: 12, fontWeight: 700, marginBottom: 20, color: '#fff' }}>Cost Breakdown</h5>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                     {[
                       { label: 'Freight Charges', val: scenario.segments[0].breakdown.freight, manifest: scenario.segments[0].breakdown.manifest.freight },
                       { label: 'Fuel & Surcharges', val: scenario.segments[0].breakdown.fuel, manifest: scenario.segments[0].breakdown.manifest.fuel },
                       { label: 'Carrier Handling', val: scenario.segments[0].breakdown.handling, manifest: scenario.segments[0].breakdown.manifest.handling },
                       { label: 'Customs & Duties', val: scenario.segments[0].breakdown.duties, manifest: scenario.segments[0].breakdown.manifest.duties },
                     ].map(item => (
                       <div key={item.label} style={{ borderBottom: '1px solid var(--border-dim)', paddingBottom: 12 }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                           <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{item.label}</span>
                           <span style={{ fontSize: 14, fontWeight: 700 }}>{format(item.val)}</span>
                         </div>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                           {item.manifest.map((m, i) => (
                             <div key={i} style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.02em' }}>• {naturalize(m)}</div>
                           ))}
                         </div>
                       </div>
                     ))}
                   </div>
                   <div style={{ marginTop: 28 }}>
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         onDeploy?.();
                       }} 
                       className="btn-search" 
                       style={{ width: '100%' }}
                     >
                       DEPLOY TO SIMULATION
                     </button>
                   </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
