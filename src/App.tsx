import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { NotificationsDrawer } from './components/layout/NotificationsDrawer';
import { LoginModal } from './components/auth/LoginModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { ParcelDetailModal } from './components/parcels/ParcelDetailModal';
import { GuidedTour } from './components/demo/GuidedTour';

// Views
import { DashboardView } from './components/dashboard/DashboardView';
import { ParcelsView } from './components/parcels/ParcelsView';
import { GisMapView } from './components/map/GisMapView';
import { PredictiveAnalyticsView } from './components/analytics/PredictiveAnalyticsView';
import { GovDataSyncView } from './components/integration/GovDataSyncView';
import { AlertsView } from './components/alerts/AlertsView';
import { ActionsView } from './components/actions/ActionsView';
import { CorridorAnalysisView } from './components/corridor/CorridorAnalysisView';
import { ReportGeneratorView } from './components/reports/ReportGeneratorView';
import { SettingsView } from './components/settings/SettingsView';

const MainLayout: React.FC = () => {
  const { activeTab, isLoggedIn } = useApp();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar 
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenLoginModal={() => setLoginModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Dynamic View Panel */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50">
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

      <GuidedTour />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
