import React, { useState } from 'react';
import {
  ShieldAlert,
  Bell,
  Search,
  LogOut,
  CheckCircle,
  Landmark,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  Menu
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { ROLE_LIST, ROLES } from '../../config/roles';
import { SystemStatusIndicator } from './SystemStatusIndicator';

interface NavbarProps {
  onOpenNotifications: () => void;
  onOpenLoginModal: () => void;
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  onOpenNotifications, 
  onOpenLoginModal,
  onToggleSidebar
}) => {
  const { 
    currentUser, 
    switchUser, 
    logout, 
    isLoggedIn, 
    searchQuery, 
    setSearchQuery, 
    unreadNotifsCount,
    resetAllData,
    setActiveTab
  } = useApp();

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActiveTab('parcels');
    }
  };

  const handleRoleChange = (role: UserRole) => {
    switchUser(role);
    setRoleMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-navy-900 border-b border-navy-800 text-white shadow-md">
      {/* Top micro-bar: institutional framing + honest prototype status */}
      <div className="bg-navy-950 px-4 py-1.5 flex items-center justify-between gap-3 text-[11px] text-slate-400 border-b border-navy-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"></span>
          <span className="font-semibold text-slate-200 tracking-wider text-[10.5px] uppercase whitespace-nowrap">GOVERNMENT OF INDIA</span>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="hidden sm:inline whitespace-nowrap text-slate-300">MoRTH · NHAI</span>
          <span className="text-slate-600 hidden lg:inline">|</span>
          <span className="text-slate-400 font-medium hidden lg:inline whitespace-nowrap">PM-GatiShakti Decision Support System</span>
        </div>
        <SystemStatusIndicator />
      </div>

      {/* Main Navbar */}
      <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Left: Brand Identity & Mobile Menu Toggle */}
        <div className="flex items-center gap-2.5">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="p-2 -ml-1 text-slate-300 hover:text-white rounded-lg hover:bg-navy-800 lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label="Toggle navigation drawer"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="w-9 h-9 rounded-lg bg-blue-700 border border-blue-600 flex items-center justify-center shadow-xs shrink-0">
              <Landmark className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base lg:text-lg font-bold tracking-tight text-white">
                  KSHETRA
                </h1>
              <span className="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 tracking-wider">
                AI PREDICT
              </span>
            </div>
            <p className="text-[10.5px] text-slate-400 font-medium hidden sm:block">
              Land Acquisition Delay Decision Support Console
            </p>
          </div>
        </div>
      </div>

        {/* Center: Global Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md lg:max-w-lg hidden md:block">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Survey No, Parcel ID, ULPIN, or Owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-20 py-1.5 text-xs bg-navy-800/80 hover:bg-navy-800 focus:bg-navy-900 border border-navy-700 focus:border-blue-500 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans"
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery('')}
                className="absolute right-14 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            )}
            <button 
              type="submit"
              className="absolute right-1 top-1/2 -translate-y-1/2 px-2.5 py-0.5 bg-blue-700 hover:bg-blue-600 text-[10.5px] font-medium text-white rounded transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Right: Actions, Role Selector, Notifications, User */}
        <div className="flex items-center gap-2">
          {/* Role Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setRoleMenuOpen(!roleMenuOpen)}
              className="px-2.5 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-700/80 border border-navy-700 text-xs text-slate-200 flex items-center gap-2 transition-colors"
              title="Switch between District Collector, CALA, and Project Planner"
            >
              <div className="flex flex-col items-start text-left">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Role</span>
                <span className="font-semibold text-blue-300 flex items-center gap-1">
                  {ROLES[currentUser.role].label}
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </span>
              </div>
            </button>

            {roleMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-navy-900 border border-navy-700 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 border-b border-navy-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Select Role Persona
                </div>

                {ROLE_LIST.map(config => (
                  <button
                    key={config.role}
                    onClick={() => handleRoleChange(config.role)}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-navy-800 transition-colors ${
                      currentUser.role === config.role ? 'bg-blue-500/15 text-blue-300 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-100">{config.label}</div>
                      <div className="text-[10px] text-slate-400">{config.officerName}</div>
                    </div>
                    {currentUser.role === config.role && <CheckCircle className="w-4 h-4 text-blue-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications Bell */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-lg bg-navy-800 hover:bg-navy-700/80 border border-navy-700 text-slate-300 hover:text-white transition-colors"
            title="View Active Alerts & Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] font-extrabold flex items-center justify-center ring-2 ring-navy-900 animate-pulse">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          {/* User Profile Avatar & Menu */}
          <div className="relative">
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center gap-2 p-1 pl-2 rounded-lg bg-navy-800 hover:bg-navy-700 border border-navy-700 text-xs transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] uppercase">
                {currentUser.name.charAt(0)}
              </div>
              <span className="font-medium text-slate-200 max-w-[100px] truncate hidden xl:inline">
                {currentUser.name.split(' ')[0]}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-navy-900 border border-navy-700 rounded-xl shadow-2xl py-2 z-50">
                <div className="px-4 py-3 border-b border-navy-800">
                  <div className="font-semibold text-white text-sm">{currentUser.name}</div>
                  <div className="text-xs text-blue-300">{currentUser.roleTitle}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{currentUser.department}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{currentUser.email}</div>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => { setActiveTab('settings'); setProfileMenuOpen(false); }}
                    className="w-full px-4 py-2 text-left text-xs text-slate-300 hover:bg-navy-800 flex items-center gap-2"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                    System Settings &amp; Risk Thresholds
                  </button>

                  <button
                    onClick={() => { setShowResetConfirm(true); setProfileMenuOpen(false); }}
                    className="w-full px-4 py-2 text-left text-xs text-amber-300 hover:bg-navy-800 flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-400" />
                    Reset Data to Sample Initial State
                  </button>

                  <div className="border-t border-navy-800 my-1"></div>

                  <button
                    onClick={() => { onOpenLoginModal(); setProfileMenuOpen(false); }}
                    className="w-full px-4 py-2 text-left text-xs text-blue-300 hover:bg-navy-800 flex items-center gap-2"
                  >
                    <ShieldAlert className="w-4 h-4 text-blue-400" />
                    Switch or Re-login Credentials
                  </button>

                  <button
                    onClick={() => { logout(); setProfileMenuOpen(false); }}
                    className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-navy-800 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4 text-red-400" />
                    Log Out Session
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-navy-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-2xl text-slate-900">
            <h3 className="text-base font-bold text-amber-700 flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              Reset Prototype Data?
            </h3>
            <p className="text-xs text-slate-500 mt-2">
              This will restore all land parcels (including P-0245), alerts, actions, and prediction states back to default sample state.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  resetAllData();
                  setShowResetConfirm(false);
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
