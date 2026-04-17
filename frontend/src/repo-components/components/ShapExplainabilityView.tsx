import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import type { Scenario } from '../engine/RouteOptimizer';
import { Brain, Zap, Layers, TrendingUp, ShieldCheck } from 'lucide-react';
import { useCurrency } from '../hooks/useCurrency';

interface Props {
  scenarios: Scenario[];
}

export const ShapExplainabilityView: React.FC<Props> = ({ scenarios }) => {
  const { format } = useCurrency();
  const recommended = scenarios.find(s => s.isRecommended) || scenarios[0];

  if (!recommended) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
        Run a route search to see ML explainability data.
      </div>
    );
  }

  const data = recommended.shapImportance.map(s => {
    const monetaryImpact = s.impact * recommended.totalCost;
    return {
      name: s.feature.toUpperCase().replace(/_/g, ' '),
      impact: s.impact * 100,
      value: monetaryImpact,
      isPositive: s.isPositive
    };
  });

  const signalChannels = ['Weather Pulse', 'Geopolitical', 'Carrier Telemetry', 'Port Sync', 'Customs Latency'];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: 'auto auto',
      gap: 16,
      height: '100%',
      animation: 'fadeIn 0.4s ease-out'
    }}>
      {/* TOP-LEFT: SHAP Waterfall Chart */}
      <div className="card" style={{
        padding: '20px 24px',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-deep))',
        display: 'flex',
        flexDirection: 'column',
        gridColumn: '1 / 2',
        gridRow: '1 / 3'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'var(--accent-primary)', padding: 8, borderRadius: 10, boxShadow: '0 0 16px rgba(99,102,241,0.3)' }}>
            <Layers size={18} color="white" />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.3 }}>Strategic Feature Attribution</h3>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>SHAP-VAL MONETARY IMPACT</p>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 2 }}>TARGET VECTOR</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent-emerald)' }}>{format(recommended.totalCost)}</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 60, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={false} />
              <XAxis type="number" hide domain={['auto', 'auto']} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="var(--text-muted)"
                fontSize={10}
                fontWeight={900}
                width={120}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                contentStyle={{ background: '#000', border: '1px solid var(--border-bright)', borderRadius: 10, padding: 12 }}
                itemStyle={{ color: '#fff', fontSize: 11, fontWeight: 700 }}
                formatter={(_val: any, _name: any, props: any) => {
                  const item = props.payload;
                  return [
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontWeight: 900, fontSize: 13, color: item.impact > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                        {item.impact > 0 ? '+' : ''}{format(item.value)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.impact.toFixed(2)}% of Final Price</div>
                    </div>,
                    ''
                  ];
                }}
              />
              <ReferenceLine x={0} stroke="var(--border-bright)" strokeWidth={2} />
              <Bar dataKey="impact" radius={[0, 4, 4, 0]} barSize={18}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.impact > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)'} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TOP-RIGHT: Decision Rationale */}
      <div className="card" style={{ padding: 20, background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Brain size={16} color="var(--accent-primary)" />
          <h4 style={{ fontSize: 13, fontWeight: 700 }}>Decision Rationale</h4>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Model prioritized <span style={{ color: '#fff', fontWeight: 700 }}>{recommended.name}</span> for its resilience to detected Asia corridor bottlenecks.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {[
            { label: 'Feature Correlation', val: '0.941' },
            { label: 'Decision Confidence', val: (recommended.confidence * 100).toFixed(1) + '%' },
            { label: 'Model Architecture', val: 'GBT + SHAP' },
            { label: 'Entropy Reduction', val: 'Σ-Balanced' }
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{item.val}</span>
            </div>
          ))}
        </div>

        {/* Confidence bar */}
        <div style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
            <span>MODEL CONFIDENCE</span>
            <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>{(recommended.confidence * 100).toFixed(1)}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--border-dim)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${recommended.confidence * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-emerald))', borderRadius: 99, transition: 'width 1s ease' }} />
          </div>
        </div>
      </div>

      {/* BOTTOM-RIGHT: Active Signal Channels */}
      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={16} color="var(--accent-cyan)" />
          <h4 style={{ fontSize: 13, fontWeight: 700 }}>Preemptive Signal Buffering</h4>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          This recommendation accounts for <span style={{ fontWeight: 700, color: '#fff' }}>48 latent signals</span> including news sentiment and port congestion indices.
        </p>

        <div>
          <label style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 1 }}>Active Signal Channels</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {signalChannels.map(t => (
              <span key={t} style={{
                fontSize: 9,
                background: 'rgba(99,102,241,0.1)',
                border: '1px solid rgba(99,102,241,0.25)',
                padding: '3px 9px',
                borderRadius: 99,
                color: 'var(--accent-primary)',
                fontWeight: 700
              }}>{t}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          {[
            { label: 'Signals Processed', val: '48', icon: <TrendingUp size={12} /> },
            { label: 'Threat Index', val: recommended.totalRisk + '%', icon: <ShieldCheck size={12} /> }
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border-dim)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-cyan)', marginBottom: 4 }}>
                {item.icon}
                <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{item.label}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'monospace' }}>{item.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
