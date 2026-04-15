import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, DollarSign, BarChart2, Shield, Clock, Box, Zap, Settings2 } from 'lucide-react';

interface Props {
  config: any;
  setConfig: (c: any) => void;
  onApply: (latest: any) => void;
}

export const ContractConfigPanel: React.FC<Props> = ({ config, setConfig, onApply }) => {
  const [activeTab, setActiveTab] = useState('Pricing');

  const updateConfig = (key: string, value: any) => {
    setConfig({ ...config, [key]: value });
  };

  const updateSla = (key: string, value: any) => {
    setConfig({ ...config, sla: { ...config.sla, [key]: value } });
  };

  const SectionHeader = ({ icon: Icon, title, id, badge }: any) => (
    <button 
      onClick={() => setActiveTab(activeTab === id ? '' : id)}
      className="clickable-section"
      style={{ 
        width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '14px 16px', 
        background: activeTab === id ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--border-dim)', 
        cursor: 'pointer',
        textAlign: 'left',
        outline: 'none',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ 
          width: 28, height: 28, borderRadius: 6, 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: activeTab === id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
          transition: 'all 0.3s'
        }}>
          <Icon size={14} color={activeTab === id ? '#fff' : 'var(--text-muted)'} />
        </div>
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: activeTab === id ? '#fff' : 'var(--text-secondary)', display: 'block' }}>
            {title.toUpperCase()}
          </span>
          {badge && <span style={{ fontSize: 9, color: 'var(--accent-primary)', fontWeight: 600 }}>{badge}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
         {activeTab === id && <div className="pulse-dot" />}
         <ChevronDown size={14} style={{ transform: activeTab === id ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s', color: 'var(--text-muted)' }} />
      </div>
    </button>
  );

  return (
    <div style={{ background: 'var(--bg-deep)', borderRadius: 16, border: '1px solid var(--border-bright)', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
      
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 10 }}>
         <Settings2 size={16} color="var(--accent-primary)" />
         <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Contract Negotiation</span>
      </div>

      <SectionHeader icon={DollarSign} title="Pricing Model" id="Pricing" badge={config.rateType === 'fixed' ? 'FIXED RATE' : 'TIERED'} />
      <AnimatePresence>
        {activeTab === 'Pricing' && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>STRATEGY</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                   <button 
                     onClick={() => updateConfig('rateType', 'fixed')}
                     style={{ 
                       padding: '8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                       background: config.rateType === 'fixed' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                       border: '1px solid ' + (config.rateType === 'fixed' ? 'var(--accent-primary)' : 'var(--border-dim)'),
                       color: config.rateType === 'fixed' ? '#fff' : 'var(--text-secondary)',
                       cursor: 'pointer'
                     }}
                   >Fixed Rate</button>
                   <button 
                     onClick={() => updateConfig('rateType', 'tiered')}
                     style={{ 
                       padding: '8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                       background: config.rateType === 'tiered' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                       border: '1px solid ' + (config.rateType === 'tiered' ? 'var(--accent-primary)' : 'var(--border-dim)'),
                       color: config.rateType === 'tiered' ? '#fff' : 'var(--text-secondary)',
                       cursor: 'pointer'
                     }}
                   >Tiered Threshold</button>
                </div>
              </div>
              
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                   <label style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>NEGOTIATED DISCOUNT (%)</label>
                   <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-primary)' }}>{Math.round((1 - config.baseRateOverride) * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="80" step="1" 
                  value={Math.round((1 - config.baseRateOverride) * 100)} 
                  onChange={(e) => updateConfig('baseRateOverride', 1 - (Number(e.target.value) / 100))} 
                  className="premium-slider"
                  style={{ width: '100%' }} 
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                   <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>0% (PARITY)</span>
                   <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>80% (MAX SAVINGS)</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SectionHeader icon={BarChart2} title="Volume Commitment" id="Volume" />
      <AnimatePresence>
        {activeTab === 'Volume' && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>MIN MONTHLY (MT)</label>
                    <span style={{ fontSize: 11, color: '#fff' }}>{config.volumeCommitment} MT</span>
                  </div>
                  <input type="range" min="10" max="5000" step="10" value={config.volumeCommitment} onChange={(e) => updateConfig('volumeCommitment', Number(e.target.value))} className="premium-slider" style={{ width: '100%' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>CURRENT YIELD (MT)</label>
                    <span style={{ fontSize: 11, color: '#fff' }}>{config.currentVolume} MT</span>
                  </div>
                  <input type="range" min="0" max="5000" step="10" value={config.currentVolume} onChange={(e) => updateConfig('currentVolume', Number(e.target.value))} className="premium-slider" style={{ width: '100%' }} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SectionHeader icon={Shield} title="Disruption Handling" id="Disruption" />
      <AnimatePresence>
        {activeTab === 'Disruption' && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: 20 }}>
              <label style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>RISK ALLOCATION CLAUSE</label>
              <select 
                value={config.disruptionClause} 
                onChange={(e) => updateConfig('disruptionClause', e.target.value)} 
                style={{ 
                  width: '100%', padding: '10px', borderRadius: 8, 
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-dim)',
                  color: '#fff', fontSize: 11, outline: 'none'
                }}
              >
                <option value="carrier_absorbs">Carrier Liability (80% Protection)</option>
                <option value="shared">Shared Risk Corridor (50/50)</option>
                <option value="client_absorbs">Client Liability (Full Exposure)</option>
              </select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SectionHeader icon={Clock} title="Service Level (SLA)" id="SLA" />
      <AnimatePresence>
        {activeTab === 'SLA' && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>MAX TRANSIT</label>
                <div style={{ position: 'relative', marginTop: 4 }}>
                  <input type="number" min="1" max="60" value={config.sla.maxTransitDays} onChange={(e) => updateSla('maxTransitDays', Number(e.target.value))} className="search-input" style={{ width: '100%', paddingRight: 30 }} />
                  <span style={{ position: 'absolute', right: 8, top: 10, fontSize: 10, color: 'var(--text-muted)' }}>d</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>PENALTY/DAY</label>
                <div style={{ position: 'relative', marginTop: 4 }}>
                  <span style={{ position: 'absolute', left: 8, top: 10, fontSize: 10, color: 'var(--text-muted)' }}>$</span>
                  <input type="number" min="0" max="5000" value={config.sla.penaltyPerDayDelay} onChange={(e) => updateSla('penaltyPerDayDelay', Number(e.target.value))} className="search-input" style={{ width: '100%', paddingLeft: 20 }} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SectionHeader icon={Box} title="Capacity Reservation" id="Capacity" />
      <AnimatePresence>
        {activeTab === 'Capacity' && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>RESERVED UNITS / WEEK</label>
                <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 700 }}>{config.reservedUnitsPerWeek}</span>
              </div>
              <input type="range" min="0" max="5000" step="50" value={config.reservedUnitsPerWeek} onChange={(e) => updateConfig('reservedUnitsPerWeek', Number(e.target.value))} className="premium-slider" style={{ width: '100%' }} />
              <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(99, 102, 241, 0.05)', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                 Higher reservations guarantee space in high-risk zones but may include a premium commitment fee.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SectionHeader icon={Zap} title="Fuel Adjustment (BAF)" id="Fuel" />
      <AnimatePresence>
        {activeTab === 'Fuel' && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: 20 }}>
               <div 
                 onClick={() => updateConfig('fuelAdjustmentEnabled', !config.fuelAdjustmentEnabled)}
                 style={{ 
                   display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                   padding: '12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
                   cursor: 'pointer', border: '1px solid ' + (config.fuelAdjustmentEnabled ? 'var(--accent-primary)' : 'var(--border-dim)')
                 }}
               >
                  <span style={{ fontSize: 11, fontWeight: 600, color: config.fuelAdjustmentEnabled ? '#fff' : 'var(--text-secondary)' }}>Include Variable Fuel (BAF)</span>
                  <div style={{ 
                    width: 32, height: 16, borderRadius: 10, background: config.fuelAdjustmentEnabled ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                    position: 'relative', transition: 'all 0.3s'
                  }}>
                    <div style={{ 
                      width: 12, height: 12, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2, left: config.fuelAdjustmentEnabled ? 18 : 2,
                      transition: 'all 0.3s'
                    }} />
                  </div>
               </div>
               
               {config.fuelAdjustmentEnabled && (
                 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>BAF PERCENTAGE</label>
                      <span style={{ fontSize: 11, color: '#fff' }}>{config.fuelPercentage}%</span>
                    </div>
                    <input type="range" min="0" max="25" step="0.5" value={config.fuelPercentage} onChange={(e) => updateConfig('fuelPercentage', Number(e.target.value))} className="premium-slider" style={{ width: '100%' }} />
                 </motion.div>
               )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border-dim)' }}>
         <button 
           onClick={() => onApply(config)} 
           className="btn-premium" 
           style={{ 
             width: '100%', padding: '14px 0', borderRadius: 10,
             display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
             boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
           }}
         >
           <Zap size={14} /> EXECUTE CONTRACT SYNC
         </button>
      </div>
    </div>
  );
};
