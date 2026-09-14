import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Map, 
  Layers, 
  AlertTriangle, 
  Navigation, 
  Compass, 
  FolderPlus,
  Route,
  Check,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Project } from '../../types';
import { NewProjectModal } from './NewProjectModal';

export const ProjectPlannerManagement: React.FC = () => {
  const { 
    currentUser, 
    projects, 
    selectedProjectId, 
    selectProject, 
    deleteProject, 
    startRouteDraft,
    setActiveTab,
    allParcels
  } = useApp();

  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Strictly enforce role restriction: ONLY Project Planner can view or interact
  if (currentUser.role !== 'planner') {
    return null;
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId) || projects[0];

  const handleEditRouteOnMap = (proj: Project, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    selectProject(proj.id);
    startRouteDraft(
      proj,
      proj.corridorPath && proj.corridorPath.length > 0 ? proj.corridorPath : [
        proj.startCoords || [11.6643, 78.1460],
        proj.endCoords || [11.8350, 77.9850]
      ],
      false,
      'edit-route',
      proj.startCoords || (proj.corridorPath ? proj.corridorPath[0] : undefined),
      proj.endCoords || (proj.corridorPath ? proj.corridorPath[proj.corridorPath.length - 1] : undefined)
    );
  };

  const handleConfirmDelete = () => {
    if (projectToDelete) {
      deleteProject(projectToDelete.id);
      setProjectToDelete(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 lg:p-6 space-y-5">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base lg:text-lg font-black text-slate-900 tracking-tight">
                Project Planner Portfolio &amp; Route Management
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wider">
                Planner Exclusive
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Create independent project corridors, select start/end points directly on the GIS map, edit alignments with your mouse, and manage project datasets.
            </p>
          </div>
        </div>

        {/* Prominent "+ Add New Project" button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-add-new-project"
            onClick={() => setIsNewProjectModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 transition-all hover:shadow-lg ring-2 ring-blue-600/20"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Add New Project</span>
          </button>
        </div>
      </div>

      {/* Project Selection Grid */}
      <div>
        <div className="flex items-center justify-between mb-3 text-xs">
          <span className="font-bold text-slate-700 uppercase tracking-wider">
            AVAILABLE PROJECTS ({projects.length}) · CLICK TO SELECT ACTIVE PROJECT
          </span>
          <span className="text-slate-500">
            Selected: <strong className="text-blue-600 font-semibold">{selectedProject.name}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => {
            const isSelected = proj.id === selectedProjectId;
            const projectParcels = allParcels.filter(p => p.projectId === proj.id);
            const highRiskCount = projectParcels.filter(p => p.riskLevel === 'high').length;
            const displayParcelsCount = proj.id === 'proj-nh79x' ? 380 : (projectParcels.length || proj.totalParcels);
            const displayHighRisk = proj.id === 'proj-nh79x' ? proj.highRiskParcels : (highRiskCount || proj.highRiskParcels);

            return (
              <div
                key={proj.id}
                onClick={() => selectProject(proj.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-blue-50/40 border-blue-500 shadow-md ring-2 ring-blue-500/30'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div>
                  {/* Card Top Row: Badge & Selection Status */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider truncate">
                      {proj.code}
                    </span>

                    {isSelected ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white flex items-center gap-1 shadow-sm">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>ACTIVE SELECTED</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200">
                        Click to Select
                      </span>
                    )}
                  </div>

                  {/* Project Title */}
                  <h3 className="font-bold text-sm text-slate-900 line-clamp-1">
                    {proj.name}
                  </h3>

                  {/* Project Type & Current Stage */}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                      {proj.projectType || 'National Highway'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 truncate max-w-[150px]">
                      {proj.currentLarrStage}
                    </span>
                  </div>

                  {/* Route Start and End Info */}
                  <div className="mt-2 text-xs text-slate-600 space-y-1 bg-white/80 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                      <span className="text-slate-400 font-medium">Start:</span>
                      <span className="font-medium text-slate-800 truncate">
                        {proj.startPointName || (proj.startCoords ? `${proj.startCoords[0].toFixed(4)}, ${proj.startCoords[1].toFixed(4)}` : 'Salem Bypass')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                      <span className="text-slate-400 font-medium">End:</span>
                      <span className="font-medium text-slate-800 truncate">
                        {proj.endPointName || (proj.endCoords ? `${proj.endCoords[0].toFixed(4)}, ${proj.endCoords[1].toFixed(4)}` : 'Thoppur Link')}
                      </span>
                    </div>
                  </div>

                  {/* Project Metrics Summary */}
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Length</div>
                      <div className="text-xs font-bold text-slate-800">{proj.totalLengthKm} km</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Parcels</div>
                      <div className="text-xs font-bold text-slate-800">{displayParcelsCount}</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Risk</div>
                      <div className={`text-xs font-bold ${displayHighRisk > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {displayHighRisk} High
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions Bar */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectProject(proj.id);
                        setActiveTab('map');
                      }}
                      className="px-2.5 py-1.5 text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                      title="View Project on GIS Map"
                    >
                      <Map className="w-3.5 h-3.5 text-blue-600" />
                      <span>View Map</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleEditRouteOnMap(proj, e)}
                      className="px-2.5 py-1.5 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg flex items-center gap-1 transition-colors"
                      title="Edit Route with Mouse on Map"
                    >
                      <Route className="w-3.5 h-3.5 text-blue-600" />
                      <span>Edit Route</span>
                    </button>
                  </div>

                  {/* Delete button (operates on selected/target project) */}
                  <button
                    type="button"
                    id={`btn-delete-proj-${proj.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setProjectToDelete(proj);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                    title={`Delete ${proj.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Project Identity & Quick Actions Footer */}
      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Active Project:</span>
            <span className="font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
              {selectedProject.name} ({selectedProject.code})
            </span>
          </div>
          <button
            onClick={() => setActiveTab('predictive')}
            className="px-3 py-1.5 bg-navy-900 hover:bg-navy-800 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
            title="Open the project-level LightGBM + SHAP + Cox delay prediction"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-300" />
            <span>Run Project AI Prediction</span>
          </button>
        </div>

        {/* Project context identity strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5">
            <div className="text-[9px] uppercase font-bold text-slate-400">Type</div>
            <div className="font-semibold text-slate-800 truncate">{selectedProject.projectType || 'National Highway'}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5">
            <div className="text-[9px] uppercase font-bold text-slate-400">Stage</div>
            <div className="font-semibold text-slate-800 truncate">{selectedProject.currentLarrStage}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5">
            <div className="text-[9px] uppercase font-bold text-slate-400">Alignment / Length</div>
            <div className="font-semibold text-slate-800">{selectedProject.totalLengthKm} km corridor</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5">
            <div className="text-[9px] uppercase font-bold text-slate-400">Modeled Parcels</div>
            <div className="font-semibold text-slate-800">
              {(allParcels.filter(p => p.projectId === selectedProject.id).length || selectedProject.totalParcels)}
              <span className="text-[9px] text-slate-400 font-normal"> — demo data</span>
            </div>
          </div>
        </div>

        {selectedProject.planningPriorities && selectedProject.planningPriorities.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Priorities:</span>
            {selectedProject.planningPriorities.map(p => (
              <span key={p} className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                {p}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200">
          <button
            onClick={() => setActiveTab('parcels')}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-lg flex items-center gap-1 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>Open Parcel Intelligence</span>
          </button>

          <button
            onClick={() => handleEditRouteOnMap(selectedProject)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg flex items-center gap-1 shadow-xs transition-colors"
          >
            <Route className="w-3.5 h-3.5" />
            <span>Edit Selected Route on Map</span>
          </button>

          <button
            type="button"
            id="btn-delete-active-project"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setProjectToDelete(selectedProject);
            }}
            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold rounded-lg flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Project</span>
          </button>
        </div>
      </div>

      {/* New Project Creation Form Modal */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
      />

      {/* Project Deletion Confirmation Dialog rendered in Portal */}
      {projectToDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-navy-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 relative z-10"
          >
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900">
              Are you sure you want to delete this project?
            </h3>

            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              You are about to delete <strong className="text-slate-900">{projectToDelete.name}</strong> ({projectToDelete.code}).
              This action will remove only this project and its independent parcels. All other projects and data will remain completely unchanged.
            </p>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                id="btn-cancel-delete"
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                id="btn-confirm-delete"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
