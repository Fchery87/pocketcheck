// Field coordinates for U.S. venues by nflverse stadium_id, for NWS point lookups. NWS
// resolves a point to a grid cell about 2.5 km wide, so four decimal places is ample.
// International venues are absent on purpose: NWS does not forecast them.
const STADIUM_POINTS: Record<string, { latitude: number; longitude: number }> = {
  ATL97: { latitude: 33.7554, longitude: -84.4008 },
  BAL00: { latitude: 39.278, longitude: -76.6227 },
  BOS00: { latitude: 42.0909, longitude: -71.2643 },
  BUF00: { latitude: 42.7738, longitude: -78.787 },
  CAR00: { latitude: 35.2258, longitude: -80.8528 },
  CHI98: { latitude: 41.8623, longitude: -87.6167 },
  CIN00: { latitude: 39.0955, longitude: -84.5161 },
  CLE00: { latitude: 41.5061, longitude: -81.6995 },
  DAL00: { latitude: 32.7473, longitude: -97.0945 },
  DEN00: { latitude: 39.7439, longitude: -105.0201 },
  DET00: { latitude: 42.34, longitude: -83.0456 },
  GNB00: { latitude: 44.5013, longitude: -88.0622 },
  HOU00: { latitude: 29.6847, longitude: -95.4107 },
  IND00: { latitude: 39.7601, longitude: -86.1639 },
  JAX00: { latitude: 30.3239, longitude: -81.6373 },
  KAN00: { latitude: 39.0489, longitude: -94.4839 },
  LAX01: { latitude: 33.9535, longitude: -118.3392 },
  MIA00: { latitude: 25.958, longitude: -80.2389 },
  MIN01: { latitude: 44.9738, longitude: -93.2581 },
  NAS00: { latitude: 36.1665, longitude: -86.7713 },
  NOR00: { latitude: 29.9511, longitude: -90.0812 },
  NYC01: { latitude: 40.8135, longitude: -74.0745 },
  PHI00: { latitude: 39.9008, longitude: -75.1675 },
  PHO00: { latitude: 33.5276, longitude: -112.2626 },
  PIT00: { latitude: 40.4468, longitude: -80.0158 },
  SEA00: { latitude: 47.5952, longitude: -122.3316 },
  SFO01: { latitude: 37.403, longitude: -121.97 },
  TAM00: { latitude: 27.9759, longitude: -82.5033 },
  VEG00: { latitude: 36.0909, longitude: -115.1833 },
  WAS00: { latitude: 38.9078, longitude: -76.8645 },
};

export function stadiumPoint(stadiumId: string): { latitude: number; longitude: number } | null {
  return STADIUM_POINTS[stadiumId] ?? null;
}
