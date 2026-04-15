const CARRIERS = [
  {
    id: 'air-expedited',
    name: 'AeroSwift Global',
    supportedModes: ['air'],
    fixedHandlingFee: 450,
    multipliers: { contract: 0.85, spot: 1.15 }
  },
  {
    id: 'ocean-bulk',
    name: 'Maersk Strategic',
    supportedModes: ['sea'],
    fixedHandlingFee: 150,
    multipliers: { contract: 0.90, spot: 1.25 }
  },
  {
    id: 'road-regional',
    name: 'TransContinental OTR',
    supportedModes: ['road'],
    fixedHandlingFee: 100,
    multipliers: { contract: 0.95, spot: 1.10 }
  },
  {
    id: 'rail-intermodal',
    name: 'Union Pacific Intermodal',
    supportedModes: ['rail'],
    fixedHandlingFee: 200,
    multipliers: { contract: 0.80, spot: 1.05 }
  }
];

module.exports = { CARRIERS };
