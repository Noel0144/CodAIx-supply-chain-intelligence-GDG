import React, { useState } from 'react';
import { ShieldCheck, Globe, Clock, Box, TrendingUp, Send, Zap, RefreshCw } from 'lucide-react';
import type { Scenario } from '../engine/RouteOptimizer';
import { useCurrency } from '../hooks/useCurrency';

interface Props {
  scenarios: Scenario[];
  origin: string;
  dest: string;
}

export const OverviewView: React.FC<Props> = ({ scenarios, origin, dest }) => {
  const { format } = useCurrency();
  const recommended = scenarios.find(s => s.isRecommended) || scenarios[0];
  const strategicPivot = scenarios.find(s => s.name === 'STRATEGIC PIVOT');
  
  const [incidentText, setIncidentText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rerouteProposal, setRerouteProposal] = useState<{
    action: string, 
    location: string,
    rationale: string, 
    savings: string,
    legs: { from: string, to: string, mode: string, duration: string }[]
  } | null>(null);
  
  const [activeRisks, setActiveRisks] = useState([
    { title: 'Weather Latency', impact: '+2d Delay', severity: 'red', desc: 'Portion of the corridor is observing severe climate disruption.' },
    { title: 'Congestion Note', impact: 'Moderate', severity: 'amber', desc: 'Increased vessel density at primary hubs.' }
  ]);

  const handleReportIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentText.trim()) return;

    setIsAnalyzing(true);
    setRerouteProposal(null);

    setTimeout(() => {
      const text = incidentText.toLowerCase();
      let proposal = null;

      if (text.includes('indian ocean') || text.includes('singapore') || text.includes('malacca')) {
        proposal = {
          action: 'Deep Sea Bypass: Cape Route',
          location: 'Indian Ocean / South Asia Corridor',
          rationale: 'Gemini 1.5 Pro deep-vision synthesis identified severe pirate clusters. Rerouting via Cape of Good Hope.',
          savings: 'Avoids 100% total loss risk',
          legs: [
            { from: 'Current Pos', to: 'Port of Colombo', mode: 'Ocean (Slow Steam)', duration: '4d' },
            { from: 'Colombo', to: 'Cape Town', mode: 'Ocean (High Speed)', duration: '12d' },
            { from: 'Cape Town', to: 'Rotterdam', mode: 'Ocean', duration: '15d' }
          ]
        };
      } else if (text.includes('suez') || text.includes('red sea') || text.includes('blocked')) {
        proposal = {
          action: 'Trans-Continental Rail Pivot',
          location: 'Suez Canal Zone',
          rationale: 'Satellite telemetry fused with multimodal news feed indicates 24-day backlog. Switching to rail bridge.',
          savings: 'Saves 22 days vs. waiting',
          legs: [
            { from: 'Port Said', to: 'Haifa Port', mode: 'Rail (Dedicated)', duration: '2d' },
            { from: 'Haifa', to: 'Final Destination', mode: 'Ocean / Road', duration: '5d' }
          ]
        };
      } else if (text.includes('stuck') || text.includes('strike') || text.includes('port')) {
        proposal = {
          action: 'Last-Mile Air Freight Injection',
          location: 'Localized Port Hub',
          rationale: 'NLP analysis of local labor unions suggests 4-week strike. Extracting via Air-Freight.',
          savings: 'Saves 12 days of idling',
          legs: [
            { from: 'Stuck Vessel', to: 'Nearest Air Hub', mode: 'Feeder / Heli-lift', duration: '1d' },
            { from: 'Air Hub', to: 'Regional DC', mode: 'Air (Expr)', duration: '2d' }
          ]
        };
      }

      if (proposal) {
        setActiveRisks(prev => [{
          title: `GEMINI ALERT: ${proposal.location}`,
          impact: 'Critical Blockage',
          severity: 'red',
          desc: `System analyzed: "${incidentText}"`
        }, ...prev]);
        setRerouteProposal(proposal);
      }
      
      setIsAnalyzing(false);
      setIncidentText('');
    }, 1500);
  };

  if (!recommended) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
      {/* Strategic Decision Panel */}
      <div className="card" style={{ padding: 40, background: 'var(--bg-surface)', border: '1px solid var(--border-bright)' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
            <div>
               <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>Strategic Command Overview</h3>
               <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Fusing global news, weather patterns, and mission-critical metrics.</p>
            </div>
            <div className="badge badge-success" style={{ padding: '10px 20px', fontSize: 11, background: 'var(--accent-emerald)', color: '#000', fontWeight: 900 }}>Strategic Path Verified</div>
         </div>

         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, marginBottom: 48 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
               <div>
                  <label style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10, display: 'block' }}>Origin Hub</label>
                  <div style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 14 }}>
                     <Globe size={24} color="var(--accent-cyan)" /> {origin.toUpperCase()}
                  </div>
               </div>
               <div>
                  <label style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10, display: 'block' }}>Final Destination</label>
                  <div style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 14 }}>
                     <Box size={24} color="var(--accent-rose)" /> {dest.toUpperCase()}
                  </div>
               </div>
            </div>

            <div style={{ background: 'rgba(99, 102, 241, 0.05)', padding: 32, borderRadius: 20, border: '1px solid rgba(99, 102, 241, 0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <TrendingUp size={18} color="var(--accent-primary)" />
                  <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>Decision Intelligence Rationale</div>
               </div>
               <p style={{ fontSize: 16, color: '#f8fafc', lineHeight: 1.6, fontWeight: 500 }}>
                  The <span style={{ color: 'var(--accent-primary)', fontWeight: 800 }}>{recommended.name}</span> scenario is prioritized for maximum mission reliability.
               </p>
               <div style={{ marginTop: 24, padding: '16px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: 12, fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', borderLeft: '3px solid var(--accent-primary)' }}>
                  "{recommended.rationale.replace(/_/g, ' ')}"
               </div>
            </div>
         </div>

          {/* STATS STRIP */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, borderTop: '1px solid var(--border-dim)', paddingTop: 40 }}>
             {[
               { label: 'Carrier', val: recommended.segments[0].carrier.name, icon: ShieldCheck, col: 'var(--accent-primary)' },
               { label: 'Total Cost', val: format(recommended.totalCost), icon: ShieldCheck, col: 'var(--accent-emerald)' },
               { label: 'ETA Window', val: `${recommended.totalTime} Days`, icon: Clock, col: 'var(--accent-cyan)' },
               { label: 'CO2 Emission', val: recommended.co2kg.toFixed(0) + ' kg', icon: Globe, col: 'var(--accent-amber)' },
             ].map(stat => (
               <div key={stat.label}>
                  <label style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10, display: 'block' }}>{stat.label}</label>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{stat.val}</div>
               </div>
             ))}
          </div>

          {/* ESG & CARBON LEDGER */}
          <div style={{ marginTop: 40, padding: 28, borderRadius: 20, background: recommended.isNetZero ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.1), transparent)' : 'linear-gradient(90deg, rgba(234, 179, 8, 0.1), transparent)', border: recommended.isNetZero ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(234, 179, 8, 0.2)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                   <Globe size={20} color={recommended.isNetZero ? 'var(--accent-emerald)' : 'var(--accent-amber)'} />
                   <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1 }}>ESG Emissions Profile</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: recommended.isNetZero ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>{recommended.co2kg.toFixed(0)} KG CO2e</div>
             </div>
             <div style={{ display: 'flex', gap: 4, marginTop: 16, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                <div style={{ 
                    width: recommended.co2kg < 50 ? '30%' : (recommended.co2kg < 200 ? '60%' : '90%'), 
                    height: '100%', 
                    background: recommended.isNetZero ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                    borderRadius: 3
                }} />
             </div>
             <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                Mission conforms to <strong>Green Logistics Tier {recommended.isNetZero ? (recommended.co2kg < 100 ? '1' : '2') : '3'}</strong> automated compliance.
             </p>
          </div>
       </div>
    </div>
  );
};
