import {
  LayoutDashboard,
  MapPin,
  Map as MapIcon,
  Cpu,
  RefreshCw,
  AlertTriangle,
  CheckSquare,
  Compass,
  FileText,
  Settings,
  LucideIcon
} from 'lucide-react';
import { UserRole } from '../types';
import { INITIAL_USERS } from '../data/mockData';
import { AccentColor } from '../components/ui';

/**
 * Centralized role configuration.
 *
 * This is the single source of truth for what each officer role is called,
 * who plays that role in the demo, which navigation modules they can see,
 * which tab they land on, and which dashboard sections should be emphasized
 * for them. App.tsx, LoginModal.tsx, Navbar.tsx and Sidebar.tsx all read
 * from this file instead of hardcoding their own copies of this data.
 */

// ---------------------------------------------------------------------------
// Navigation module registry (all possible modules, keyed by tab id)
// ---------------------------------------------------------------------------

export type NavItemId =
  | 'dashboard'
  | 'parcels'
  | 'map'
  | 'predictive'
  | 'govsync'
  | 'alerts'
  | 'actions'
  | 'corridor'
  | 'reports'
  | 'settings';

export interface NavItemDefinition {
  id: NavItemId;
  label: string;
  icon: LucideIcon;
  /** Accent color for this module's icon tile — carries meaning (GIS=teal, AI=indigo, alerts=red, ...). */
  color: AccentColor;
  /** How the sidebar badge for this item should be derived at render time. */
  badgeKind: 'none' | 'static' | 'count-parcels' | 'count-alerts' | 'count-actions';
  badgeText?: string; // used when badgeKind === 'static'
}

export const NAV_ITEM_DEFINITIONS: Record<NavItemId, NavItemDefinition> = {
  dashboard: {
    id: 'dashboard',
    label: 'Executive Dashboard',
    icon: LayoutDashboard,
    color: 'blue',
    badgeKind: 'none'
  },
  parcels: {
    id: 'parcels',
    label: 'Land Parcels',
    icon: MapPin,
    color: 'blue',
    badgeKind: 'count-parcels'
  },
  map: {
    id: 'map',
    label: 'GIS Cadastral Map',
    icon: MapIcon,
    color: 'teal',
    badgeKind: 'static',
    badgeText: 'GIS'
  },
  predictive: {
    id: 'predictive',
    label: 'Predictive Analytics (AI)',
    icon: Cpu,
    color: 'indigo',
    badgeKind: 'static',
    badgeText: 'AI'
  },
  govsync: {
    id: 'govsync',
    label: 'Gov Data Sources',
    icon: RefreshCw,
    color: 'purple',
    badgeKind: 'static',
    badgeText: 'DEMO'
  },
  alerts: {
    id: 'alerts',
    label: 'Early Warning Alerts',
    icon: AlertTriangle,
    color: 'red',
    badgeKind: 'count-alerts'
  },
  actions: {
    id: 'actions',
    label: 'Case & Action Tracker',
    icon: CheckSquare,
    color: 'amber',
    badgeKind: 'count-actions'
  },
  corridor: {
    id: 'corridor',
    label: 'Corridor Route Analysis',
    icon: Compass,
    color: 'teal',
    badgeKind: 'static',
    badgeText: 'PLANNER'
  },
  reports: {
    id: 'reports',
    label: 'Generate Reports',
    icon: FileText,
    color: 'blue',
    badgeKind: 'none'
  },
  settings: {
    id: 'settings',
    label: 'System Settings',
    icon: Settings,
    color: 'neutral',
    badgeKind: 'none'
  }
};

// ---------------------------------------------------------------------------
// Role configuration
// ---------------------------------------------------------------------------

/** Keys identifying which dashboard emphasis sections a role cares about. */
export type DashboardFocusKey =
  // Collector
  | 'district-overview'
  | 'high-risk-cases'
  | 'alerts-escalations'
  | 'acquisition-progress'
  // CALA / LA Officer
  | 'parcel-risk'
  | 'acquisition-cases'
  | 'early-warnings'
  | 'action-tracker'
  // Planner
  | 'corridor-analysis'
  | 'alternative-alignment'
  | 'predicted-delay'
  | 'route-comparison';

export interface RoleConfig {
  role: UserRole;
  /** Short display name used in role selectors / navbar. */
  label: string;
  /** Officer playing this role in the demo (sourced from mock user records). */
  officerName: string;
  /** Official designation / title for this role. */
  designation: string;
  /** Government-issue email used for the mock SSO login form. */
  email: string;
  /** One-line description of what this role is for, used in login/landing UI. */
  description: string;
  /** Tab the user lands on after login or after switching into this role. */
  defaultTab: NavItemId;
  /** Ordered list of navigation modules visible to this role (excluding Settings, which is always available). */
  navItemIds: NavItemId[];
  /** Dashboard sections emphasized for this role. */
  dashboardFocus: DashboardFocusKey[];
}

const findUser = (role: UserRole) => {
  const user = INITIAL_USERS.find(u => u.role === role);
  if (!user) {
    throw new Error(`No mock user configured for role "${role}"`);
  }
  return user;
};

export const ROLES: Record<UserRole, RoleConfig> = {
  collector: {
    role: 'collector',
    label: 'District Collector',
    officerName: findUser('collector').name,
    designation: findUser('collector').roleTitle,
    email: findUser('collector').email,
    description: 'District-wide oversight, high-risk case escalation & final approvals',
    defaultTab: 'dashboard',
    navItemIds: ['dashboard', 'parcels', 'map', 'predictive', 'alerts', 'actions', 'reports'],
    dashboardFocus: ['district-overview', 'high-risk-cases', 'alerts-escalations', 'acquisition-progress']
  },
  cala: {
    role: 'cala',
    label: 'CALA / LA Officer',
    officerName: findUser('cala').name,
    designation: findUser('cala').roleTitle,
    email: findUser('cala').email,
    description: 'Parcel-level acquisition casework, AI predictions & field actions',
    defaultTab: 'dashboard',
    navItemIds: ['dashboard', 'parcels', 'map', 'predictive', 'alerts', 'actions', 'govsync', 'reports'],
    dashboardFocus: ['parcel-risk', 'acquisition-cases', 'early-warnings', 'action-tracker']
  },
  planner: {
    role: 'planner',
    label: 'Project Planner',
    officerName: findUser('planner').name,
    designation: findUser('planner').roleTitle,
    email: findUser('planner').email,
    description: 'Corridor design, alignment comparison & route delay forecasting',
    defaultTab: 'dashboard',
    navItemIds: ['dashboard', 'map', 'predictive', 'corridor', 'parcels', 'reports'],
    dashboardFocus: ['corridor-analysis', 'alternative-alignment', 'predicted-delay', 'route-comparison']
  }
};

/** Roles in the fixed display order used across role selector UIs. */
export const ROLE_ORDER: UserRole[] = ['collector', 'cala', 'planner'];

export const ROLE_LIST: RoleConfig[] = ROLE_ORDER.map(role => ROLES[role]);

/** Full nav item list a role can see, in order, with Settings always appended last. */
export const getNavItemsForRole = (role: UserRole): NavItemDefinition[] => {
  const ids = [...ROLES[role].navItemIds, 'settings' as NavItemId];
  return ids.map(id => NAV_ITEM_DEFINITIONS[id]);
};

/** Whether a given tab id is reachable by a role (nav modules + Settings). */
export const isTabAllowedForRole = (role: UserRole, tab: string): boolean => {
  return tab === 'settings' || ROLES[role].navItemIds.includes(tab as NavItemId);
};
