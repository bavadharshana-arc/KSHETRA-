import React from 'react';
import {
  Sparkles,
  ChevronLeft,
  ArrowRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const GuidedTour: React.FC = () => {
  const { 
    demoTourActive, 
    demoTourStep, 
    nextDemoTourStep, 
    prevDemoTourStep, 
    endDemoTour, 
    setActiveTab, 
    setSearchQuery, 
    openParcelDetail,
    runProjectDelayPrediction,
    syncGovernmentDataForParcel,
    switchUser,
    logout
  } = useApp();

  if (!demoTourActive) return null;

  const steps = [
    {
      step: 1,
      title: 'Step 1: Role-Based Government Login',
      description: 'You are authenticated as Thiru. M. Senthil Kumar, DRO (CALA / Land Acquisition Officer). You can switch anytime between District Collector, CALA, and Project Planner.',
      actionText: 'Proceed to Dashboard',
      onAction: () => {
        setActiveTab('dashboard');
        nextDemoTourStep();
      }
    },
    {
      step: 2,
      title: 'Step 2: Executive Decision Dashboard',
      description: 'Review interactive KPI cards (380 Total, 242 Acquired, 28 High Risk), statutory LARR 2013 stage funnel, and the Critical High-Risk Action Queue.',
      actionText: 'Search Parcel P-0245',
      onAction: () => {
        setActiveTab('parcels');
        setSearchQuery('P-0245');
        nextDemoTourStep();
      }
    },
    {
      step: 3,
      title: 'Step 3: Search Parcel P-0245',
      description: 'The search filter has located target Parcel P-0245 (Survey No 125/2, ULPIN TN-SLM-2024-88412, Owner: R. Ramasamy & 4 Co-sharers in Kamalapuram).',
      actionText: 'Open Parcel Details Dossier',
      onAction: () => {
        openParcelDetail('P-0245');
        nextDemoTourStep();
      }
    },
    {
      step: 4,
      title: 'Step 4: Open Comprehensive Parcel Dossier',
      description: 'Parcel P-0245 dossier is open. It contains full statutory details, cadastral extents, and multi-tab government integrations.',
      actionText: 'Run Simulated Gov Data Sync (Demo)',
      onAction: async () => {
        await syncGovernmentDataForParcel('P-0245');
        nextDemoTourStep();
      }
    },
    {
      step: 5,
      title: 'Step 5: Multi-Source Government Integration (Simulated)',
      description: 'A simulated sync is replayed across Tamil Nilam, Bhoomi revenue portal, ULPIN cadastral, e-Courts CIS 3.0, and ISRO Bhuvan GIS. These are proposed integrations — the prototype has no live government connection and every record shown is synthetic.',
      actionText: 'View Land Records (Bhoomi)',
      onAction: () => {
        nextDemoTourStep();
      }
    },
    {
      step: 6,
      title: 'Step 6: Inspect Bhoomi / Revenue Records',
      description: 'Inspect Patta No 904, Khata 8841, Wetland (Nanjai) classification, ₹48 Lakhs/Acre guideline value, and unmutated partition status.',
      actionText: 'Check e-Courts Judicial Record',
      onAction: () => {
        nextDemoTourStep();
      }
    },
    {
      step: 7,
      title: 'Step 7: Check e-Courts Stay Order',
      description: 'Active Civil Suit O.S. 412/2023 detected in Sub-Court Omalur with CNR TNSL010045232023. An interim injunction is active on Section 3E possession!',
      actionText: 'Run Project-Level Prediction',
      onAction: async () => {
        await runProjectDelayPrediction();
        nextDemoTourStep();
      }
    },
    {
      step: 8,
      title: 'Step 8: Project-Level AI Delay Prediction',
      description: 'The LightGBM model scored the entire acquisition project (aggregated from its parcel register) and returned a delay probability, risk classification, SHAP factors and a Cox survival curve — all computed by the local AI engine on synthetic data and shown in the dossier’s "Project AI Prediction" tab.',
      actionText: 'Review Explainable AI (SHAP)',
      onAction: () => {
        nextDemoTourStep();
      }
    },
    {
      step: 9,
      title: 'Step 9: Explainable AI (Why is the project at risk?)',
      description: 'SHAP feature attribution shows which aggregated project factors — active litigation, unmutated titles, compensation backlog, statutory stage — pushed the prediction up or down. Exact weights are computed by the model on each run.',
      actionText: 'Inspect on GIS Cadastral Map',
      onAction: () => {
        setActiveTab('map');
        nextDemoTourStep();
      }
    },
    {
      step: 10,
      title: 'Step 10: Interactive GIS Cadastral Map',
      description: 'View color-coded polygon boundaries (🔴 Red for P-0245, 🟢 Green for clear title) overlapping the 60m NH-79X Highway RoW centerline buffer.',
      actionText: 'View Early Warning Alerts',
      onAction: () => {
        setActiveTab('alerts');
        nextDemoTourStep();
      }
    },
    {
      step: 11,
      title: 'Step 11: Early Warning & Alert Management',
      description: 'Critical Alert ALT-1092 generated for Parcel P-0245. High risk alert details trigger reasons and recommended early legal verification.',
      actionText: 'Assign Case Action to Officer',
      onAction: () => {
        setActiveTab('actions');
        nextDemoTourStep();
      }
    },
    {
      step: 12,
      title: 'Step 12: Case & Action Management Board',
      description: 'Action ACT-501 (File petition to vacate civil stay & deposit award in LA-RA) is assigned to DRO M. Senthil Kumar.',
      actionText: 'Explore Project Planner Corridor View',
      onAction: () => {
        setActiveTab('corridor');
        nextDemoTourStep();
      }
    },
    {
      step: 13,
      title: 'Step 13: Corridor Route Risk & Alignments',
      description: 'Section 2 (Km 18–42) is identified as the critical bottleneck. Alignment B (Northern Agro Bypass) saves 3.1 months and bypasses 22 disputed parcels.',
      actionText: 'Generate Official Decision Report',
      onAction: () => {
        setActiveTab('reports');
        nextDemoTourStep();
      }
    },
    {
      step: 14,
      title: 'Step 14: Official Decision Report Generator',
      description: 'Full official printable dossier ready for Collector & NHAI sign-off, containing project KPIs, risk tables, and statutory action directives.',
      actionText: 'Finish Demonstration Tour',
      onAction: () => {
        endDemoTour();
      }
    }
  ];

  const currentStepData = steps[demoTourStep - 1] || steps[0];

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-in slide-in-from-bottom-5 duration-200">
      <div className="bg-navy-900 border-2 border-amber-500 rounded-2xl p-5 shadow-2xl text-slate-100 space-y-3 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500 text-navy-950">
              <Sparkles className="w-4 h-4" />
            </span>
            <span className="font-mono text-xs font-bold text-amber-400">
              DEMO STEP {demoTourStep} / {steps.length}
            </span>
          </div>

          <button
            onClick={endDemoTour}
            className="text-slate-400 hover:text-white text-xs px-2 py-1 bg-navy-800 hover:bg-navy-700 rounded-lg"
          >
            Exit Tour ✕
          </button>
        </div>

        <div>
          <h3 className="font-black text-sm text-white">{currentStepData.title}</h3>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {currentStepData.description}
          </p>
        </div>

        <div className="pt-2 border-t border-navy-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={prevDemoTourStep}
              disabled={demoTourStep === 1}
              className="p-1.5 bg-navy-800 hover:bg-navy-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-slate-400 font-mono">
              {demoTourStep}/{steps.length}
            </span>
          </div>

          <button
            onClick={currentStepData.onAction}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-navy-950 text-xs font-black rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <span>{currentStepData.actionText}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
