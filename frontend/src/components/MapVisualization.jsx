import React, { useEffect, useState, Fragment } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Circle, useMap, useMapEvents, Tooltip } from 'react-leaflet';

import L from 'leaflet';
import { MapPin, Plane, Ship, Truck, Activity, ShieldAlert, AlertTriangle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet markers in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Icon Generator
const createIcon = (color, svgPath) => {
  return L.divIcon({
    html: `<div style="background: ${color}; padding: 6px; border-radius: 50%; display: flex; box-shadow: 0 0 15px ${color}80; border: 2px solid white;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
               ${svgPath}
             </svg>
           </div>`,
    className: 'custom-leaflet-icon',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

const shipIcon = createIcon('#0ea5e9', '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path><path d="M19.38 20.42a2.4 2.4 0 0 0 1.62.58 2.4 2.4 0 0 0 1.62-.58"></path><path d="M3.5 18h17"></path><path d="m11 11.5 2.5-4h7.5L19 11.5"></path><path d="M7 11.5V18"></path><path d="M11 11.5V18"></path><path d="M15 11.5V18"></path>');
const planeIcon = createIcon('#a855f7', '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"></path>');
const truckIcon = createIcon('#f59e0b', '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path><path d="M15 18H9"></path><path d="M19 18h2a1 1 0 0 0 1-1v-5h-4l-3 5"></path><circle cx="7" cy="18" r="2"></circle><circle cx="17" cy="18" r="2"></circle>');
const disruptionIcon = createIcon('#ef4444', '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>');
const holdIcon = createIcon('#6366f1', '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>');


const MODE_COLORS = {
  air: '#a855f7',
  sea: '#3b82f6',
  road: '#f59e0b',
  rail: '#10b981',
};

const MODE_DASH = {
  air: '10, 10',
  sea: 'none',
  road: '5, 5',
  rail: '15, 5',
};

// Map Centering and Events
const MapController = ({ center, zoom, bounds, onMapClick }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, bounds, map]);

  useMapEvents({
    click: (e) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
};

const MapVisualization = ({ 
  shipments = [], riskZones = [], activeDisruptions = [], 
  selectedRoute = null, center = [20, 0], zoom = 2, 
  interactive = true, onMapClick = null,
  onResolveDisruption = null,
  hitZones = []
}) => {

  const [bounds, setBounds] = useState(null);

  // Stringify shipment IDs to prevent constant re-zooming on every animation tick
  const shipmentIds = shipments.map(s => s.id).join(',');

  useEffect(() => {
    if (selectedRoute && selectedRoute.displaySegments) {
      const allPoints = selectedRoute.displaySegments.flatMap(s => s.points);
      if (allPoints.length > 0) {
        setBounds(allPoints.map(p => [p.lat, p.lng]));
      }
    } else if (shipments.length > 0) {
      const allPoints = shipments.flatMap(s => s.route.displaySegments.flatMap(ds => ds.points));
      if (allPoints.length > 0) {
        setBounds(allPoints.map(p => [p.lat, p.lng]));
      }
    }
  }, [selectedRoute, shipmentIds]);

  const renderSegments = (segments, keyPrefix) => {
    if (!segments) return null;
    return segments.map((seg, idx) => {
      // Only style as impacted if the global hitZones array (passed as prop) contains at least one of this segment's impact zones.
      // Or if the toggle cleared hitZones, then nothing is considered 'impacted' visually.
      const isImpacted = seg.isImpacted && hitZones.length > 0 && 
                         seg.impactZones?.some(iz => hitZones.some(hz => hz.id === iz.id || hz.name === iz.name));
      
      return (
        <Fragment key={`${keyPrefix}-${idx}`}>
          <Polyline 
            positions={seg.points.map(p => [p.lat, p.lng])}
            pathOptions={{ 
              color: isImpacted ? '#ef4444' : (MODE_COLORS[seg.mode] || 'var(--primary)'), 
              weight: isImpacted ? 5 : 4, 
              opacity: isImpacted ? 0.9 : 0.7,
              dashArray: isImpacted ? '8, 8' : MODE_DASH[seg.mode],
              lineCap: 'round'
            }}
          />
          {isImpacted && seg.points.length >= 2 && (
            <Marker 
              position={[(seg.points[0].lat + seg.points[1].lat) / 2, (seg.points[0].lng + seg.points[1].lng) / 2]} 
              icon={createIcon('#ef4444', '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>')}
            >
              <Popup>
                <div style={{ padding: '8px' }}>
                  <strong style={{ color: '#ef4444' }}>DISRUPTION IMPACT</strong>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>
                    Segment delayed and cost-adjusted due to proximity to {seg.impactZones?.[0]?.name || 'threat zone'}.
                  </div>
                </div>
              </Popup>
              <Tooltip permanent direction="center" opacity={0.9}>
                 <div style={{ fontSize: '10px', fontWeight: 900, color: '#ef4444', textShadow: '0 0 4px rgba(0,0,0,0.5)' }}>
                    PATH INTERSECTION
                 </div>
              </Tooltip>
            </Marker>
          )}
        </Fragment>
      );
    });
  };



  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', borderRadius: 'inherit', overflow: 'hidden' }}>
      <MapContainer center={center} zoom={zoom} zoomControl={false} scrollWheelZoom={interactive} dragging={interactive}>
        <MapController center={center} zoom={zoom} bounds={bounds} onMapClick={onMapClick} />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {/* Global Risk Zones */}
        {riskZones.map((zone, idx) => (
          <Fragment key={`zone-${idx}`}>
            <Circle 
              center={[zone.lat, zone.lng]} 
              radius={zone.radius * 1000} 
              pathOptions={{ 
                color: zone.riskScore > 80 ? '#ef4444' : '#f59e0b', 
                fillOpacity: 0.1, 
                weight: 1,
                dashArray: '5, 10'
              }} 
            />
            <Marker position={[zone.lat, zone.lng]} icon={disruptionIcon}>
              <Popup>
                <div style={{ color: 'white', padding: '4px' }}>
                  <strong style={{ color: '#ef4444' }}>{zone.name}</strong><br/>
                  <small>Score: {zone.riskScore}%</small>
                </div>
              </Popup>
            </Marker>
          </Fragment>
        ))}

        {/* Active Disruptions */}
        {(activeDisruptions || []).map((d, idx) => {
          const isHit = hitZones.some(hz => hz.id === d.id || hz.name === d.name);
          return (
            <Fragment key={`active-dis-${d.id || idx}`}>
              <Circle 
                center={[d.lat, d.lng]} 
                radius={d.radius * 600} 
                pathOptions={{ 
                  stroke: isHit, 
                  color: '#fff', 
                  weight: 1, 
                  fillColor: '#ef4444', 
                  fillOpacity: isHit ? 0.25 : 0.08 
                }} 
              />
              <Circle 
                center={[d.lat, d.lng]} 
                radius={d.radius * (isHit ? 2500 : 1200)} 
                pathOptions={{ 
                  stroke: false, 
                  fillColor: '#ef4444', 
                  fillOpacity: isHit ? 0.1 : 0.04 
                }} 
              />
              <Circle 
                center={[d.lat, d.lng]} 
                radius={d.radius * (isHit ? 4000 : 2000)} 
                pathOptions={{ 
                  color: '#ef4444', 
                  weight: isHit ? 1 : 0.5, 
                  dashArray: isHit ? 'none' : '5, 15', 
                  fillColor: '#ef4444', 
                  fillOpacity: 0.02 
                }} 
              />

              <Marker position={[d.lat, d.lng]} icon={isHit ? createIcon('#fff', '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>') : disruptionIcon}>
                {isHit && (
                  <Tooltip permanent direction="top" offset={[0, -20]} opacity={1} className="hit-tooltip">
                    <div style={{ background: '#ef4444', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 900, border: '2px solid white', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.5)' }}>
                      PATH INTERSECTION: {d.name.toUpperCase()}
                    </div>
                  </Tooltip>
                )}
                <Popup>
                  <div style={{ color: 'white', padding: '10px', minWidth: '140px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <ShieldAlert size={16} color="#ef4444" />
                      <strong style={{ color: '#ef4444', fontSize: '0.8rem' }}>{d.name.toUpperCase()}</strong>
                    </div>
                    {isHit && (
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '6px', borderRadius: '4px', marginBottom: '10px', fontSize: '11px', fontWeight: 600 }}>
                        ⚠️ CRITICAL: Current route directly intersects this threat zone.
                      </div>
                    )}
                    <small style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '12px' }}>
                      {d.isAutonomous ? 'Autonomous Threat Detection' : 'Manual Simulation Injection'}
                    </small>
                    
                    {onResolveDisruption && !d.isAutonomous && (
                      <button 
                        onClick={() => onResolveDisruption(d.id)}
                        style={{
                          width: '100%',
                          padding: '6px',
                          background: 'rgba(59, 130, 246, 0.2)',
                          border: '1px solid var(--primary)',
                          borderRadius: '4px',
                          color: 'var(--primary)',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        RESOLVE INCIDENT
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            </Fragment>
          );
        })}


        {/* Selected Preview Route */}
        {selectedRoute && renderSegments(selectedRoute.displaySegments, 'preview')}

        {/* Live Shipments */}
        {(shipments || []).map((s) => (
          <Fragment key={s.id}>
            {renderSegments(s.route.displaySegments, `shipment-${s.id}`)}
            <Marker 
              position={[s.currentLat, s.currentLng]} 
              icon={s.route.modes.includes('air') ? planeIcon : s.route.modes.includes('sea') ? shipIcon : truckIcon}
            >
              <Popup>
                <div style={{ padding: '8px', minWidth: '150px' }}>
                  <h4 style={{ marginBottom: '4px', color: 'white' }}>{s.input.origin} ➝ {s.input.destination}</h4>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Status: {s.status.replace('_', ' ')}</p>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '8px 0', paddingTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span>Risk:</span> <span style={{ color: s.risk.composite > 60 ? '#ef4444' : '#10b981' }}>{s.risk.composite}%</span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          </Fragment>
        ))}
      </MapContainer>


      {/* Map Actions */}
      <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button 
          onClick={() => setBounds(selectedRoute?.displaySegments.flatMap(s => s.points).map(p => [p.lat, p.lng]))}
          style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-bright)', color: 'white', padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 800 }}
        >
          <Activity size={14} /> RESET VIEW
        </button>
      </div>

      {/* Legend Overlay */}

      <div style={{ 
        position: 'absolute', bottom: '16px', left: '16px', zIndex: 1000, 
        padding: '0.5rem', background: 'rgba(10,10,12,0.9)', 
        color: 'white', fontSize: '0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#a855f7' }}></div> Air Path
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }}></div> Sea Path
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }}></div> Road Path
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', opacity: 0.3 }}></div> Threat Zone
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapVisualization;
