import React, { useState } from 'react';
import { 
  X, 
  Shield, 
  Lock, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  UserCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { ROLE_LIST, ROLES } from '../../config/roles';
import { DEMO_CREDENTIALS } from '../../config/authCredentials';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const { switchUser, loginWithCredentials } = useApp();

  const [selectedRole, setSelectedRole] = useState<UserRole>('cala');
  const [email, setEmail] = useState<string>(DEMO_CREDENTIALS.cala.email);
  const [password, setPassword] = useState<string>(DEMO_CREDENTIALS.cala.password);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');

  if (!isOpen) return null;

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMessage('');
    setEmail(DEMO_CREDENTIALS[role].email);
    setPassword(DEMO_CREDENTIALS[role].password);
  };

  const handleQuickLogin = (role: UserRole) => {
    setIsLoading(true);
    setTimeout(() => {
      switchUser(role);
      setIsLoading(false);
      onClose();
    }, 300);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email.includes('@')) {
      setErrorMessage('Please enter a valid government email address (.gov.in / .nic.in).');
      return;
    }

    if (!password || password.length < 4) {
      setErrorMessage('Password must be at least 4 characters long.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const success = loginWithCredentials(email, password, selectedRole);
      setIsLoading(false);
      if (success) {
        setSuccessMessage('Authentication verified by NIC Single Sign-On (SSO). Redirecting...');
        setTimeout(() => {
          onClose();
        }, 500);
      } else {
        setErrorMessage('Invalid email or password for the selected role. Please use the demo credentials shown below the password field.');
      }
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-navy-900 border border-navy-700 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden text-slate-100 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-navy-800 bg-navy-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Government Official Authentication</h3>
              <p className="text-xs text-slate-400">KSHETRA Land Acquisition Decision Support System</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Quick Role Selection Cards */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Select Officer Role (1-Click Quick Access)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {ROLE_LIST.map(config => (
                <button
                  key={config.role}
                  type="button"
                  onClick={() => handleRoleSelect(config.role)}
                  className={`p-3 rounded-xl border text-left transition-all relative ${
                    selectedRole === config.role
                      ? 'bg-blue-500/15 border-blue-500 ring-1 ring-blue-500 text-white'
                      : 'bg-navy-800/60 border-navy-700 text-slate-300 hover:bg-navy-800'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-100">{config.label}</div>
                  <div className="text-[10px] text-blue-400 mt-0.5">{config.officerName}</div>
                  <div className="text-[9px] text-slate-400 mt-1">{config.description}</div>
                  {selectedRole === config.role && (
                    <CheckCircle2 className="w-4 h-4 text-blue-400 absolute top-2 right-2" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Quick 1-Click Login Button */}
          <button
            type="button"
            onClick={() => handleQuickLogin(selectedRole)}
            disabled={isLoading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all"
          >
            <UserCheck className="w-4 h-4" />
            <span>Launch Dashboard as {ROLES[selectedRole].label}</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-navy-800 w-full"></div>
            <span className="bg-navy-900 px-3 text-[11px] text-slate-500 uppercase tracking-wider font-semibold absolute">
              Or Sign In with Official SSO
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{successMessage}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                NIC / Official Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="officer@nic.in / @tn.gov.in"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-navy-800 border border-navy-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                NIC e-Gov Password / Token
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-navy-800 border border-navy-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Security: 256-bit NIC Gateway</span>
              <span className="text-blue-400 font-mono">Demo: {DEMO_CREDENTIALS[selectedRole].password}</span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 bg-navy-800 hover:bg-navy-700 text-slate-200 hover:text-white border border-navy-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {isLoading ? (
                <span>Authenticating with NIC SSO Gateway...</span>
              ) : (
                <>
                  <span>Sign In via e-Pramaan SSO</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
