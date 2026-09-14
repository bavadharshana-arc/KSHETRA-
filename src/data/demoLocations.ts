/**
 * DEMONSTRATION location directory for the Project Planner's corridor setup.
 *
 * This is NOT a live geocoding service. KSHETRA has no external geocoding
 * integration. This is a small, fixed list of towns / junctions / landmarks in
 * the Salem–Namakkal demonstration region, extending the existing hard-coded
 * corridor presets into a searchable picker. Coordinates are approximate and are
 * used only to seed a proposed planning alignment in the prototype.
 *
 * In production the same Start/End picker would query an authorised gazetteer /
 * cadastral location service.
 */
export interface DemoLocation {
  name: string;
  district: string;
  kind: 'Town' | 'Junction' | 'Industrial' | 'Landmark' | 'Village';
  lat: number;
  lng: number;
}

export const DEMO_PLANNING_LOCATIONS: DemoLocation[] = [
  { name: 'Salem', district: 'Salem', kind: 'Town', lat: 11.6643, lng: 78.146 },
  { name: 'Namakkal', district: 'Namakkal', kind: 'Town', lat: 11.2189, lng: 78.1674 },
  { name: 'Omalur', district: 'Salem', kind: 'Town', lat: 11.742, lng: 78.041 },
  { name: 'Attur', district: 'Salem', kind: 'Town', lat: 11.598, lng: 78.599 },
  { name: 'Salem Junction (Kandhampatti Bypass)', district: 'Salem', kind: 'Junction', lat: 11.6643, lng: 78.146 },
  { name: 'Salem New Bus Stand', district: 'Salem', kind: 'Landmark', lat: 11.6720, lng: 78.1350 },
  { name: 'Omalur Railway Flyover', district: 'Salem', kind: 'Junction', lat: 11.742, lng: 78.041 },
  { name: 'Mettur Dam Industrial Park', district: 'Salem', kind: 'Industrial', lat: 11.795, lng: 77.801 },
  { name: 'Edappadi Town', district: 'Salem', kind: 'Town', lat: 11.59, lng: 77.83 },
  { name: 'Sankagiri Fort Junction', district: 'Salem', kind: 'Junction', lat: 11.48, lng: 77.87 },
  { name: 'Attur Town Bypass', district: 'Salem', kind: 'Town', lat: 11.598, lng: 78.599 },
  { name: 'Vazhapadi Junction', district: 'Salem', kind: 'Junction', lat: 11.67, lng: 78.42 },
  { name: 'Thoppur Ghats Link', district: 'Dharmapuri', kind: 'Landmark', lat: 11.835, lng: 77.985 },
  { name: 'Namakkal Central Corridor', district: 'Namakkal', kind: 'Town', lat: 11.2189, lng: 78.1674 },
  { name: 'Rasipuram Ring Road', district: 'Namakkal', kind: 'Junction', lat: 11.464, lng: 78.178 },
  { name: 'Tiruchengode Bus Stand', district: 'Namakkal', kind: 'Town', lat: 11.38, lng: 77.895 },
  { name: 'Mohanur Bridge', district: 'Namakkal', kind: 'Landmark', lat: 11.28, lng: 78.11 },
  { name: 'Komarapalayam Textile Cluster', district: 'Namakkal', kind: 'Industrial', lat: 11.44, lng: 77.7 },
  { name: 'Kottagoundampatti', district: 'Salem', kind: 'Village', lat: 11.70, lng: 78.06 },
  { name: 'Karuppur West', district: 'Salem', kind: 'Village', lat: 11.64, lng: 78.12 },
  { name: 'Vellakkalpatti', district: 'Salem', kind: 'Village', lat: 11.72, lng: 78.05 },
  { name: 'Mallasamudram', district: 'Namakkal', kind: 'Village', lat: 11.38, lng: 78.02 },
  { name: 'Danishpet', district: 'Salem', kind: 'Village', lat: 11.83, lng: 78.22 },
  { name: 'Periyeri', district: 'Salem', kind: 'Village', lat: 11.60, lng: 78.55 }
];

export const searchDemoLocations = (query: string): DemoLocation[] => {
  const q = query.trim().toLowerCase();
  if (!q) return DEMO_PLANNING_LOCATIONS.slice(0, 8);
  return DEMO_PLANNING_LOCATIONS.filter(
    l => l.name.toLowerCase().includes(q) || l.district.toLowerCase().includes(q) || l.kind.toLowerCase().includes(q)
  ).slice(0, 8);
};
