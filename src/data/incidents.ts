export type Confidence = 'high' | 'medium' | 'low';

export type Source = 'X' | 'Bluesky' | 'User';

export interface Incident {
  id: number;
  type: string;
  lat: number;
  lng: number;
  conf: Confidence;
  score: number;
  reports: number;
  hasImage: boolean;
  sources: Source[];
  time: string;
  desc: string;
  icon: string;
}

export const MOCK_INCIDENTS: Incident[] = [
  {
    id: 1,
    type: 'Flooding',
    lat: 43.4516,
    lng: -80.4925,
    conf: 'high',
    score: 87,
    reports: 14,
    hasImage: true,
    sources: ['X', 'Bluesky', 'User'],
    time: '4 min ago',
    desc: 'Multiple residents reporting basement flooding on Erb St. Water main may have burst.',
    icon: '🌊',
  },
  {
    id: 2,
    type: 'Fallen Tree',
    lat: 43.4652,
    lng: -80.5232,
    conf: 'high',
    score: 81,
    reports: 9,
    hasImage: true,
    sources: ['X', 'User'],
    time: '11 min ago',
    desc: 'Large oak fallen across King St N, blocking both lanes.',
    icon: '🌳',
  },
  {
    id: 3,
    type: 'Downed Power Line',
    lat: 43.4428,
    lng: -80.51,
    conf: 'medium',
    score: 54,
    reports: 5,
    hasImage: false,
    sources: ['X', 'Bluesky'],
    time: '23 min ago',
    desc: 'Live wire reported on sidewalk near University Ave.',
    icon: '⚡',
  },
  {
    id: 4,
    type: 'Traffic Hazard',
    lat: 43.458,
    lng: -80.531,
    conf: 'medium',
    score: 47,
    reports: 4,
    hasImage: true,
    sources: ['User'],
    time: '31 min ago',
    desc: 'Broken traffic light at Columbia/Fischer-Hallman intersection.',
    icon: '🚦',
  },
  {
    id: 5,
    type: 'Road Damage',
    lat: 43.472,
    lng: -80.485,
    conf: 'low',
    score: 22,
    reports: 2,
    hasImage: false,
    sources: ['X'],
    time: '48 min ago',
    desc: 'Large pothole reported on Northfield Dr E.',
    icon: '🕳️',
  },
  {
    id: 6,
    type: 'Structural Damage',
    lat: 43.4605,
    lng: -80.476,
    conf: 'high',
    score: 76,
    reports: 11,
    hasImage: true,
    sources: ['X', 'User', 'Bluesky'],
    time: '2 min ago',
    desc: 'Roof collapse reported at vacant building on Bridgeport Rd.',
    icon: '🏚️',
  },
  {
    id: 7,
    type: 'Flooding',
    lat: 43.439,
    lng: -80.505,
    conf: 'medium',
    score: 61,
    reports: 6,
    hasImage: true,
    sources: ['X', 'User'],
    time: '18 min ago',
    desc: 'Intersection flooding near Fairway. Multiple vehicles stalled.',
    icon: '🌊',
  },
];