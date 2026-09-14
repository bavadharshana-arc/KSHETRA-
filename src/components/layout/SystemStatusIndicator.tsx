import React, { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, Cpu, Database, Map as MapIcon, Landmark, PlugZap } from 'lucide-react';
import { checkBackendHealth } from '../../services/mlApiService';

/**
 * Truthful system / integration status.
 *
 * KSHETRA is a prototype. It has NO live connection to any government system.
 * This panel deliberately separates:
 *   - what is genuinely running  (the local AI engine, the GIS basemap, the demo dataset)
 *   - what is only simulated      (the government data-source walkthrough)
 *   - what is not connected at all (external government APIs)
 *
 * The AI engine row reflects the real FastAPI /health response; everything else
 * is a fixed, honest statement about the prototype.
 */

type Tone = 'online' | 'simulated' | 'notConnected' | 'checking';

const TONE_STYLES: Record<Tone, { dot: string; text: string; chip: string; label: string }> = {
  online: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    label: 'Online',
  },
  simulated: {
    dot: 'bg-amber-400',
    text: 'text-amber-700',
    chip: 'bg-amber-100 text-amber-800 border-amber-200',
    label: 'Prototype / Simulated',
  },
  notConnected: {
    dot: 'bg-slate-400',
    text: 'text-slate-600',
    chip: 'bg-slate-100 text-slate-600 border-slate-200',
    label: 'Not connected',
  },
  checking: {
    dot: 'bg-slate-300',
    text: 'text-slate-500',
    chip: 'bg-slate-100 text-slate-500 border-slate-200',
    label: 'Checking…',
  },
};

interface StatusRow {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  tone: Tone;
  detail: string;
  statusText?: string;
}

export const SystemStatusIndicator: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [aiTone, setAiTone] = useState<Tone>('checking');
  const [aiDetail, setAiDetail] = useState<string>('Contacting the local AI prediction service…');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      const { isHealthy, mode } = await checkBackendHealth();
      if (cancelled) return;
      if (!isHealthy) {
        setAiTone('notConnected');
        setAiDetail('Local AI prediction service is not responding. Start the backend and retry.');
      } else if (mode === 'demo-fallback') {
        setAiTone('online');
        setAiDetail('Running locally on the deterministic demo estimator (trained model pipeline not loaded).');
      } else {
        setAiTone('online');
        setAiDetail('Running locally — LightGBM + SHAP + Cox on synthetic demonstration data.');
      }
    };
    ping();
    const id = setInterval(ping, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const rows: StatusRow[] = [
    {
      icon: Cpu,
      name: 'AI Prediction Engine',
      tone: aiTone,
      statusText:
        aiTone === 'online' ? 'Online (local)' : aiTone === 'checking' ? 'Checking…' : 'Offline',
      detail: aiDetail,
    },
    {
      icon: Database,
      name: 'Local / Demo Data',
      tone: 'online',
      statusText: 'Loaded',
      detail: 'Bundled synthetic parcel, case and corridor records. No external database.',
    },
    {
      icon: MapIcon,
      name: 'GIS Map Engine',
      tone: 'online',
      statusText: 'Online',
      detail: 'Leaflet with public OpenStreetMap / Esri basemap tiles. Parcel geometry is synthetic.',
    },
    {
      icon: Landmark,
      name: 'Government Data Sources',
      tone: 'simulated',
      statusText: 'Prototype / Simulated',
      detail:
        'The Tamil Nilam / Bhoomi Rashi / ULPIN / e-Courts / Bhuvan walkthrough replays scripted sample data. Nothing is fetched from a government system.',
    },
    {
      icon: PlugZap,
      name: 'External Government APIs',
      tone: 'notConnected',
      statusText: 'Not connected',
      detail:
        'LACRRIS, Bhoomi Rashi, ULPIN/Bhu-Naksha, NJDG / e-Courts CIS 3.0 and ISRO Bhuvan are proposed integrations — no live connection exists in this build.',
    },
  ];

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[11px] text-slate-300 hover:text-white transition-colors"
        title="View KSHETRA system & integration status"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-semibold tracking-wide uppercase text-[10px] text-slate-200">
          <Activity className="w-3 h-3 text-blue-300" />
          Prototype Environment
        </span>
        <span className="hidden lg:inline text-slate-400">
          AI Engine:{' '}
          <span className={aiTone === 'online' ? 'text-emerald-400 font-semibold' : 'text-slate-300 font-semibold'}>
            {aiTone === 'online' ? 'Online' : aiTone === 'checking' ? 'Checking…' : 'Offline'}
          </span>
        </span>
        <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-2xl z-50 text-slate-800 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <div className="text-xs font-bold text-slate-900">System &amp; Integration Status</div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              KSHETRA is a demonstration prototype. It has no live connection to any government
              system — all statutory, revenue and court records shown are synthetic.
            </p>
          </div>

          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const tone = TONE_STYLES[row.tone];
              const Icon = row.icon;
              return (
                <li key={row.name} className="px-4 py-3 flex gap-3">
                  <Icon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">{row.name}</span>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${tone.chip}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                        {row.statusText ?? tone.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">{row.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400">
            AI engine status is checked live against the local service. Integration rows are fixed
            statements about this prototype build.
          </div>
        </div>
      )}
    </div>
  );
};
