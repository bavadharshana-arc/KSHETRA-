import { UserRole } from '../types';
import { ROLES } from './roles';

/**
 * Centralized DEMO/mock authentication credentials for the KSHETRA login screen.
 *
 * This is the single source of truth for demo sign-in email + password pairs
 * used by the login screen and the in-app "switch / re-login" modal. Nothing
 * here is a real credential — these are illustrative government-style demo
 * accounts for evaluation purposes only, and must never be replaced with a
 * real personal email/password.
 *
 * Officer identity (name, designation, department, etc.) still comes from
 * ROLES / INITIAL_USERS in config/roles.ts and data/mockData.ts — this file
 * only adds the login-specific demo email/password used to authenticate into
 * that existing identity.
 */

export interface DemoCredential {
  role: UserRole;
  /** Demo sign-in email shown/prefilled on the login screen. */
  email: string;
  /** Demo sign-in password. Never a real credential. */
  password: string;
}

export const DEMO_CREDENTIALS: Record<UserRole, DemoCredential> = {
  collector: {
    role: 'collector',
    email: 'collector@kshtra.gov.in',
    password: 'Kshetra@123'
  },
  cala: {
    role: 'cala',
    email: 'cala@kshtra.gov.in',
    password: 'Kshetra@123'
  },
  planner: {
    role: 'planner',
    email: 'planner@kshtra.gov.in',
    password: 'Kshetra@123'
  }
};

/** Shared demo password shown as a hint on the login screen. */
export const DEMO_PASSWORD = 'Kshetra@123';

/** Validates a submitted email/password pair against the demo credential for a specific role. */
export const isValidDemoLogin = (email: string, password: string, role: UserRole): boolean => {
  const cred = DEMO_CREDENTIALS[role];
  if (!cred) return false;
  return (
    email.trim().toLowerCase() === cred.email.toLowerCase() &&
    password === cred.password
  );
};

/** Convenience: officer display label + name for a role, for login UI. */
export const getOfficerSummary = (role: UserRole) => ({
  label: ROLES[role].label,
  officerName: ROLES[role].officerName,
  designation: ROLES[role].designation
});
