import React, { useState, useRef, useEffect } from 'react';
import { Package, Calendar, ChevronDown, MapPin, Search } from 'lucide-react';
import type { ShipmentParams } from '../engine/RiskModeler';
import { CurrencySelector } from './common/CurrencySelector';
import { motion, AnimatePresence } from 'framer-motion';
import { resolveLocation } from '../data/logisticsData';
import axios from 'axios';

interface Props {
  params: ShipmentParams;
  setParams: (p: ShipmentParams) => void;
  onSearch: () => void;
}

export const TopSearchBar: React.FC<Props> = ({ params, setParams, onSearch }) => {
  const [isOriginOpen, setIsOriginOpen] = useState(false);
  const [isDestOpen, setIsDestOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const originRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    axios.get('/api/hubs')
      .then(res => {
        if (res.data && res.data.cities) {
          setCities(res.data.cities);
        }
      })
      .catch(err => console.error('Failed to load cities', err));
  }, []);

  // CLICK OUTSIDE HANDLER
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
      if (originRef.current && !originRef.current.contains(target)) {
        setIsOriginOpen(false);
      }
      if (destRef.current && !destRef.current.contains(target)) {
        setIsDestOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleHubSelect = (type: 'origin' | 'dest', city: string) => {
    const hub = resolveLocation(city);
    if (type === 'origin') {
      setParams({ ...params, originHub: hub, originCity: city, originCountry: hub.country });
      setIsOriginOpen(false);
    } else {
      setParams({ ...params, destHub: hub, destCity: city, destCountry: hub.country });
      setIsDestOpen(false);
    }
  };

  return (
    <div className="top-search-header">
      <div className="search-container">
        <div style={{ padding: '0 8px' }}>
          <CurrencySelector />
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border-dim)' }} />
        
        {/* ORIGIN */}
        <div className="search-input-wrapper" ref={originRef}>
          <MapPin size={16} />
          <button 
            onClick={() => { setIsOriginOpen(!isOriginOpen); setIsDestOpen(false); setIsOpen(false); }}
            className="search-input"
            style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}
          >
            <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>{params.originCity || 'Origin'}</span>
            <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
          </button>

          <AnimatePresence>
            {isOriginOpen && (
              <motion.div 
                className="dropdown-panel"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{ maxHeight: 300, overflowY: 'auto' }}
              >
                {cities.map(c => (
                  <button 
                    key={c} 
                    onClick={() => handleHubSelect('origin', c)}
                    className={`dropdown-item ${params.originCity === c ? 'active' : ''}`}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {c}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border-dim)' }} />

        {/* DESTINATION */}
        <div className="search-input-wrapper" ref={destRef}>
          <MapPin size={16} />
          <button 
            onClick={() => { setIsDestOpen(!isDestOpen); setIsOriginOpen(false); setIsOpen(false); }}
            className="search-input"
            style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}
          >
            <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>{params.destCity || 'Destination'}</span>
            <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
          </button>

          <AnimatePresence>
            {isDestOpen && (
              <motion.div 
                className="dropdown-panel"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{ maxHeight: 300, overflowY: 'auto' }}
              >
                {cities.map(c => (
                  <button 
                    key={c} 
                    onClick={() => handleHubSelect('dest', c)}
                    className={`dropdown-item ${params.destCity === c ? 'active' : ''}`}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {c}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border-dim)' }} />

        {/* SHIPMENT SIZE PRESETS (Quick Select) */}
        <div className="search-input-wrapper" ref={dropdownRef}>
          <Package size={16} />
          <button 
            onClick={() => { setIsOpen(!isOpen); setIsOriginOpen(false); setIsDestOpen(false); }}
            className="search-input"
            style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ fontWeight: 600 }}>PRESET: {params.weight < 200 ? 'SMALL' : params.weight < 1000 ? 'MEDIUM' : 'LARGE'}</span>
            <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
          </button>

          <AnimatePresence>
            {isOpen && (
              <motion.div 
                className="dropdown-panel"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                {[
                  { id: 'small', label: 'SMALL (100kg)', w: 100 },
                  { id: 'medium', label: 'MEDIUM (500kg)', w: 500 },
                  { id: 'large', label: 'LARGE (2000kg)', w: 2000 }
                ].map((s) => (
                  <button 
                    key={s.id}
                    onClick={() => {
                      setParams({ ...params, weight: s.w });
                      setIsOpen(false);
                    }}
                    className={`dropdown-item ${params.weight === s.w ? 'active' : ''}`}
                  >
                    {s.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border-dim)' }} />

        {/* DATE PICKER */}
        <div className="search-input-wrapper">
          <Calendar size={16} />
          <input 
            type="date" 
            value={params.deliveryDeadline}
            onChange={(e) => setParams({ ...params, deliveryDeadline: e.target.value })}
            className="search-input"
          />
        </div>

        <button className="btn-search" onClick={onSearch}>
          <Search size={16} />
        </button>
      </div>

    </div>
  );
};
