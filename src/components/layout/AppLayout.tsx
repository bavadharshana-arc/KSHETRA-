import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { useUrlState } from '../../hooks/useUrlState';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { NotificationsDrawer } from './NotificationsDrawer';
import { LoginModal } from '../auth/LoginModal';
import { ParcelDetailModal } from '../parcels/ParcelDetailModal';
import { ErrorBoundary } from '../feedback/ErrorBoundary';
import { X } from 'lucide-react';

// Views
import { DashboardView } from '../dashboard/DashboardView';
import { ParcelsView } from '../parcels/ParcelsView';
import { GisMapView } from '../map/GisMapView';
import { PredictiveAnalyticsView } from '../analytics/PredictiveAnalyticsView';
import { GovDataSyncView } from '../integration/GovDataSyncView';
import { AlertsView } from '../alerts/AlertsView';
import { ActionsView } from '../actions/ActionsView';
import { CorridorAnalysisView } from '../corridor/CorridorAnalysisView';
import { ReportGeneratorView } from '../reports/ReportGeneratorView';
import { SettingsView } from '../settings/SettingsView';

export const AppLayout: React.FC = () => {
  const { activeTab } = useApp();

  // URL hash synchronization with role guard
  useUrlState();

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Close mobile nav on escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isMobileNavOpen) {
      setIsMobileNavOpen(false);
    }
  }, [isMobileNavOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Prevent background scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileNavOpen]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar 
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenLoginModal={() => setLoginModalOpen(true)}
        onToggleSidebar={() => setIsMobileNavOpen(prev => !prev)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block shrink-0">
          <Sidebar />
        </div>

        {/* Mobile Off-Canvas Drawer Backdrop & Sidebar */}
        {isMobileNavOpen && (
          <div
            className="fixed inset-0 z-50 lg:hidden flex"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation"
          >
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
              onClick={() => setIsMobileNavOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer */}
            <div className="relative w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Navigation Menu</span>
                <button
                  type="button"
                  onClick={() => setIsMobileNavOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                  aria-label="Close navigation drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Sidebar onItemClick={() => setIsMobileNavOpen(false)} className="w-full border-r-0" />
              </div>
            </div>
          </div>
        )}

        {/* Dynamic View Panel wrapped in ErrorBoundary */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50 relative focus:outline-none" tabIndex={-1}>
          <ErrorBoundary moduleName={`Module: ${activeTab}`}>
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'parcels' && <ParcelsView />}
            {activeTab === 'map' && <GisMapView />}
            {activeTab === 'predictive' && <PredictiveAnalyticsView />}
            {activeTab === 'govsync' && <GovDataSyncView />}
            {activeTab === 'alerts' && <AlertsView />}
            {activeTab === 'actions' && <ActionsView />}
            {activeTab === 'corridor' && <CorridorAnalysisView />}
            {activeTab === 'reports' && <ReportGeneratorView />}
            {activeTab === 'settings' && <SettingsView />}
          </ErrorBoundary>
        </main>
      </div>

      {/* Modals and Overlays */}
      <ParcelDetailModal />
      
      <NotificationsDrawer 
        isOpen={notificationsOpen} 
        onClose={() => setNotificationsOpen(false)} 
      />

      <LoginModal 
        isOpen={loginModalOpen} 
        onClose={() => setLoginModalOpen(false)} 
      />

    </div>
  );
};
