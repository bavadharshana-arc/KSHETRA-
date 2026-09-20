import { useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { isTabAllowedForRole, ROLES } from '../config/roles';
import { UserRole } from '../types';

/**
 * Synchronizes application navigation and selection state with URL hash.
 * Enables direct bookmarking/linking while enforcing role authorization guards.
 * E.g., `#tab=parcels` or `#tab=parcels&parcel=P-0556`.
 */
export const useUrlState = () => {
  const {
    currentUser,
    activeTab,
    setActiveTab,
    selectedParcel,
    openParcelDetail
  } = useApp();

  // Parse URL hash parameters
  const parseHash = useCallback((): { tab?: string; parcelId?: string } => {
    if (typeof window === 'undefined') return {};
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return {};

    const params = new URLSearchParams(hash);
    return {
      tab: params.get('tab') || undefined,
      parcelId: params.get('parcel') || undefined
    };
  }, []);

  // Update hash when activeTab or selectedParcel changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams();
    if (activeTab) params.set('tab', activeTab);
    if (selectedParcel?.id) params.set('parcel', selectedParcel.id);

    const newHash = `#${params.toString()}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  }, [activeTab, selectedParcel]);

  // Read hash on mount and hashchange, verifying role permissions
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleHashSync = () => {
      const { tab, parcelId } = parseHash();
      if (tab) {
        if (isTabAllowedForRole(currentUser.role, tab)) {
          if (tab !== activeTab) {
            setActiveTab(tab);
          }
        } else {
          // Role is not permitted to view this tab - fallback to role default
          const defaultTab = ROLES[currentUser.role as UserRole]?.defaultTab || 'dashboard';
          setActiveTab(defaultTab);
          window.history.replaceState(null, '', `#tab=${defaultTab}`);
        }
      }

      if (parcelId && (!selectedParcel || selectedParcel.id !== parcelId)) {
        openParcelDetail(parcelId);
      }
    };

    handleHashSync();
    window.addEventListener('hashchange', handleHashSync);
    return () => {
      window.removeEventListener('hashchange', handleHashSync);
    };
  }, [currentUser.role, activeTab, selectedParcel, setActiveTab, openParcelDetail, parseHash]);
};
