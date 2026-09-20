import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginScreen } from './components/auth/LoginScreen';

const RootContent: React.FC = () => {
  const { isLoggedIn } = useApp();

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  return <AppLayout />;
};

export default function App() {
  return (
    <AppProvider>
      <RootContent />
    </AppProvider>
  );
}
