import React, { useState } from 'react';
import {
  Landmark,
  ShieldCheck,
  Mail,
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { ROLE_LIST } from '../../config/roles';
import { DEMO_CREDENTIALS, DEMO_PASSWORD } from '../../config/authCredentials';

/**
 * KSHETRA sign-in screen shown whenever no officer session is active.
 *
 * This screen only decides WHICH existing role experience gets loaded
 * (Collector / CALA / Planner) — it does not alter dashboards, sidebar,
 * navigation, or role permissions, all of which continue to be driven by
 * config/roles.ts and AppContext exactly as before.
 */
export const LoginScreen: React.FC = () => {
  const { loginWithCredentials } = useApp();

  const [selectedRole, setSelectedRole] = useState<UserRole>('cala');
  const [email, setEmail] = useState<string>(DEMO_CREDENTIALS.cala.email);
  const [password, setPassword] = useState<string>(DEMO_CREDENTIALS.cala.password);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMessage('');
    setEmail(DEMO_CREDENTIALS[role].email);
    setPassword(DEMO_CREDENTIALS[role].password);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email and password to continue.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const success = loginWithCredentials(email, password, selectedRole);
      setIsLoading(false);
      if (!success) {
        setErrorMessage(
          `Invalid email or password for ${ROLE_LIST.find(r => r.role === selectedRole)?.label}. Please use the demo credentials shown below the password field.`
        );
      }
    }, 500);
  };

  return (
    <div className="min-h-screen bg-navy-950 text-slate-100 flex flex-col">
      {/* Government identity strip */}
      <div className="bg-navy-900 border-b border-navy-800 px-4 py-2 text-center text-[11px] sm:text-xs text-slate-400 tracking-wide">
        <span className="font-semibold text-slate-300">GOVERNMENT OF INDIA</span>
        <span className="mx-2 text-navy-600">|</span>
        <span>Ministry of Road Transport &amp; Highways</span>
        <span className="mx-2 text-navy-600">|</span>
        <span className="text-blue-300 font-medium">PM-GatiShakti</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-5 rounded-2xl overflow-hidden shadow-2xl border border-navy-800">
          {/* Left: Brand panel */}
          <div className="lg:col-span-2 bg-navy-900 p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Landmark className="w-7 h-7" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-white">KSHETRA</h1>
                  <p className="text-[11px] text-blue-300 font-medium">Decision Support System</p>
                </div>
              </div>

              <p className="mt-6 text-sm text-slate-300 leading-relaxed">
                Land Acquisition Delay Decision Support System — predictive risk analytics
                and case oversight for national highway corridor land acquisition.
              </p>

              <div className="mt-8 flex items-center gap-2 text-xs text-emerald-300">
                <ShieldCheck className="w-4 h-4" />
                <span>Secured Government Officer Sign-In</span>
              </div>
            </div>

            <div className="mt-10 space-y-1 text-[11px] text-slate-500">
              <p>Government of India</p>
              <p>Ministry of Road Transport &amp; Highways</p>
              <p className="text-blue-300/80">PM-GatiShakti</p>
            </div>
          </div>

          {/* Right: Role selection + sign-in form */}
          <div className="lg:col-span-3 bg-navy-900 p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-base font-bold text-white">Sign in as your officer role</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose your persona to load the corresponding dashboard experience.
              </p>
            </div>

            {/* Role cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {ROLE_LIST.map(config => {
                const isSelected = selectedRole === config.role;
                return (
                  <button
                    key={config.role}
                    type="button"
                    onClick={() => handleRoleSelect(config.role)}
                    aria-pressed={isSelected}
                    className={`relative text-left p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-blue-500/15 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-navy-800/60 border-navy-700 hover:bg-navy-800 hover:border-navy-600'
                    }`}
                  >
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-blue-400 absolute top-2.5 right-2.5" />
                    )}
                    <div className="text-xs font-bold text-white pr-5">{config.label}</div>
                    <div className="text-[10px] text-blue-300 mt-1 leading-snug">{config.officerName}</div>
                    <div className="text-[9px] text-slate-400 mt-1.5 leading-snug">{config.description}</div>
                  </button>
                );
              })}
            </div>

            {/* Sign-in form */}
            <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
              {errorMessage && (
                <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/60 text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="officer@kshtra.gov.in"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-navy-800 border border-navy-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-9 py-2.5 text-sm bg-navy-800 border border-navy-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                <span>Demo environment only — not a real credential</span>
                <span className="text-blue-400 font-mono">Demo password: {DEMO_PASSWORD}</span>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-70"
              >
                {isLoading ? (
                  <span>Signing in…</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-navy-900 text-center text-[11px] text-slate-500">
        Protected under Digital India Single Sign-On (SSO) Protocol · Demo credentials only
      </div>
    </div>
  );
};
