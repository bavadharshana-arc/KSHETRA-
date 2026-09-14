import React, { useState } from 'react';
import {
  X,
  Bell,
  CheckCheck,
  AlertTriangle,
  CheckSquare,
  RefreshCw,
  Cpu,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { IconTile } from '../ui';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose
}) => {
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    openParcelDetail,
    setActiveTab
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<'all' | 'alert' | 'action' | 'sync'>('all');

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'all') return true;
    return n.type === activeFilter;
  });

  const handleNotificationClick = (parcelId?: string, type?: string) => {
    if (parcelId) {
      openParcelDetail(parcelId);
      onClose();
    } else if (type === 'action') {
      setActiveTab('actions');
      onClose();
    } else if (type === 'alert') {
      setActiveTab('alerts');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-navy-950/50 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col text-slate-800 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2.5">
              <IconTile icon={Bell} color="blue" size="sm" />
              <h2 className="font-bold text-sm text-slate-900">System Alerts &amp; Notifications</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={markAllNotificationsRead}
                className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 font-medium"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-4 py-2 bg-white border-b border-slate-200 flex gap-2 overflow-x-auto text-xs">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setActiveFilter('alert')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeFilter === 'alert'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200'
              }`}
            >
              Alerts
            </button>
            <button
              onClick={() => setActiveFilter('action')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeFilter === 'action'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200'
              }`}
            >
              Actions
            </button>
            <button
              onClick={() => setActiveFilter('sync')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeFilter === 'sync'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200'
              }`}
            >
              Sync
            </button>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50">
            {filteredNotifications.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs">No notifications in this category.</p>
              </div>
            ) : (
              filteredNotifications.map(notif => {
                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      markNotificationRead(notif.id);
                      handleNotificationClick(notif.parcelId, notif.type);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer group ${
                      notif.isRead
                        ? 'bg-white/60 border-slate-200 hover:bg-white text-slate-500'
                        : 'bg-white border-blue-200 shadow-sm text-slate-800 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {notif.type === 'alert' && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                        {notif.type === 'action' && <CheckSquare className="w-4 h-4 text-amber-600 shrink-0" />}
                        {notif.type === 'sync' && <RefreshCw className="w-4 h-4 text-purple-600 shrink-0" />}
                        {notif.type === 'prediction' && <Cpu className="w-4 h-4 text-indigo-600 shrink-0" />}
                        <span className="font-semibold text-xs text-slate-900 group-hover:text-blue-700 transition-colors">
                          {notif.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{notif.timestamp}</span>
                    </div>

                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {notif.message}
                    </p>

                    {notif.parcelId && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-blue-600 font-medium">
                        <span>View Parcel {notif.parcelId}</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-200 bg-white text-center text-[11px] text-slate-400">
            Simulated feed — e-Courts &amp; Bhoomi webhooks are a proposed integration (Demo)
          </div>
        </div>
      </div>
    </div>
  );
};
