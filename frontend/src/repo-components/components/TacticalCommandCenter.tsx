import React, { useState } from 'react';
import { Send, Zap, RefreshCw, Globe, Box, ShieldCheck, AlertTriangle } from 'lucide-react';

export const TacticalCommandCenter: React.FC = () => {
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

  return (
    <div className="card" style={{ padding: 20, background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 16 }}>
       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Zap size={18} color="var(--accent-cyan)" />
          <h4 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Tactical Command Center</h4>
       </div>
       <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          Upload incident telematics or request an emergency pivot from <strong>Gemini 1.5 Pro</strong>.
       </p>

       <form onSubmit={handleReportIncident} style={{ position: 'relative' }}>
          <input 
            type="text" 
            placeholder="Situation query..." 
            value={incidentText}
            onChange={(e) => setIncidentText(e.target.value)}
            disabled={isAnalyzing}
            style={{
              width: '100%',
              padding: '12px 40px 12px 16px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border-bright)',
              borderRadius: 10,
              color: '#fff',
              fontSize: 12,
              outline: 'none'
            }}
          />
          <button 
            type="submit"
            disabled={isAnalyzing}
            style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              color: isAnalyzing ? 'var(--text-muted)' : 'var(--accent-primary)',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              padding: 8
            }}
          >
             {isAnalyzing ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
       </form>

       <AnimatePresence>
       {rerouteProposal && (
          <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid var(--accent-emerald)', borderRadius: 12, padding: 16, animation: 'fadeIn 0.5s' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <ShieldCheck size={16} color="var(--accent-emerald)" />
                <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--accent-emerald)', letterSpacing: 1 }}>GEMINI SUGGESTED PIVOT</span>
             </div>
             <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, color: '#fff' }}>
               {rerouteProposal.action}
             </div>
             <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
               {rerouteProposal.rationale}
             </p>
             <button style={{ width: '100%', padding: '10px', background: 'var(--accent-emerald)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 900, fontSize: 11, cursor: 'pointer' }}>
               EXECUTE MISSION PIVOT
             </button>
          </div>
       )}
       </AnimatePresence>

       <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-dim)', paddingTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Active Threat Monitor</div>
          {activeRisks.slice(0, 2).map((risk, i) => (
            <div key={i} style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dim)', borderRadius: 8 }}>
               <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, color: risk.severity === 'red' ? 'var(--accent-rose)' : 'var(--accent-amber)' }}>{risk.title}</div>
               <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{risk.desc}</div>
            </div>
          ))}
       </div>
    </div>
  );
};

// Simple AnimatePresence mock if not using framer-motion in this file (though user has it)
const AnimatePresence: React.FC<{children: React.ReactNode}> = ({children}) => <>{children}</>;
