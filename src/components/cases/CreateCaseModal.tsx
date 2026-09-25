import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Project, Workflow } from '../../../shared/types';
import { createCase } from '../../lib/api';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

interface CreateCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  workflows: Workflow[];
  onCaseCreated: () => void;
}

export const CreateCaseModal: React.FC<CreateCaseModalProps> = ({
  isOpen,
  onClose,
  projects,
  workflows,
  onCaseCreated,
}) => {
  const [projectId, setProjectId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [tehsil, setTehsil] = useState('');
  const [village, setVillage] = useState('');
  const [totalArea, setTotalArea] = useState('');
  const [estimatedComp, setEstimatedComp] = useState('');
  const [priority, setPriority] = useState('medium');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [geojsonBoundaryText, setGeojsonBoundaryText] = useState('');

  // Parcel fields - clean empty initial row
  const [parcels, setParcels] = useState<
    Array<{
      survey_number: string;
      khata_number: string;
      landowner_names: string;
      land_type: string;
      area_acres: string;
    }>
  >([
    {
      survey_number: '',
      khata_number: '',
      landowner_names: '',
      land_type: 'Agricultural',
      area_acres: '',
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddParcel = () => {
    setParcels([
      ...parcels,
      {
        survey_number: '',
        khata_number: '',
        landowner_names: '',
        land_type: 'Agricultural',
        area_acres: '',
      },
    ]);
  };

  const handleRemoveParcel = (idx: number) => {
    setParcels(parcels.filter((_, i) => i !== idx));
  };

  const handleParcelChange = (index: number, field: string, value: string) => {
    const updated = [...parcels];
    (updated[index] as any)[field] = value;
    setParcels(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !workflowId || !title || !state || !district || !village) {
      setError('Please fill in all mandatory fields.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let parsedBoundary: any = undefined;
      if (geojsonBoundaryText.trim()) {
        try {
          parsedBoundary = JSON.parse(geojsonBoundaryText);
        } catch (e: any) {
          setError(`Invalid GeoJSON boundary syntax: ${e.message}`);
          setIsLoading(false);
          return;
        }
      }

      const formattedParcels = parcels.map((p) => ({
        survey_number: p.survey_number,
        khata_number: p.khata_number,
        landowner_names: p.landowner_names
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean),
        land_type: p.land_type,
        area_acres: Number(p.area_acres || 1),
      }));

      await createCase({
        project_id: projectId,
        workflow_id: workflowId,
        title,
        description,
        state,
        district,
        tehsil,
        village,
        total_area_hectares: Number(totalArea),
        estimated_compensation: Number(estimatedComp || 0),
        priority,
        start_date: startDate,
        geojson_boundary: parsedBoundary,
        parcels: formattedParcels,
      });

      setIsLoading(false);
      onCaseCreated();
      onClose();
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'Failed to create case');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Initiate Land Acquisition Case"
      subtitle="Configure case metadata, location, and assign standard or custom workflow engine"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 border border-red-200 text-red-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Section 1: Project & Workflow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Infrastructure Project <span className="text-red-500">*</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              className="w-full rounded-md border border-slate-200 p-2 text-xs focus:border-gov-navy focus:outline-none bg-slate-50/50"
            >
              <option value="">-- Select Sponsoring Project --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Workflow Engine Model <span className="text-red-500">*</span>
            </label>
            <select
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              required
              className="w-full rounded-md border border-slate-200 p-2 text-xs focus:border-gov-navy focus:outline-none bg-slate-50/50"
            >
              <option value="">-- Select Configured Workflow --</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.version})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Section 2: Case Title & Description */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Case Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Talegaon Multi-Modal Interchange Parcel A"
            required
            className="w-full rounded-md border border-slate-200 p-2 text-xs focus:border-gov-navy focus:outline-none"
          />
        </div>

        {/* Section 3: Geographic Hierarchy */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">State *</label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
              className="w-full rounded-md border border-slate-200 p-2 text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">District *</label>
            <input
              type="text"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="e.g. Pune"
              required
              className="w-full rounded-md border border-slate-200 p-2 text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tehsil</label>
            <input
              type="text"
              value={tehsil}
              onChange={(e) => setTehsil(e.target.value)}
              placeholder="e.g. Maval"
              className="w-full rounded-md border border-slate-200 p-2 text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Village *</label>
            <input
              type="text"
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              placeholder="e.g. Talegaon"
              required
              className="w-full rounded-md border border-slate-200 p-2 text-xs"
            />
          </div>
        </div>

        {/* Section 4: Quantitative & Timeline */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Area (Hectares) *</label>
            <input
              type="number"
              step="0.01"
              value={totalArea}
              onChange={(e) => setTotalArea(e.target.value)}
              required
              className="w-full rounded-md border border-slate-200 p-2 text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Estimated Comp (₹)</label>
            <input
              type="number"
              value={estimatedComp}
              onChange={(e) => setEstimatedComp(e.target.value)}
              className="w-full rounded-md border border-slate-200 p-2 text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-md border border-slate-200 p-2 text-xs bg-slate-50/50"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border border-slate-200 p-2 text-xs"
            />
          </div>
        </div>

        {/* Section 4.5: Spatial Corridor Boundary (Optional) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-semibold text-slate-700">
              Corridor Spatial Boundary (GeoJSON - Optional)
            </label>
            <span className="text-[10px] text-slate-400">WGS84 Polygon / Feature</span>
          </div>
          <textarea
            rows={3}
            value={geojsonBoundaryText}
            onChange={(e) => setGeojsonBoundaryText(e.target.value)}
            placeholder={`{"type": "Polygon", "coordinates": [[[77.102, 28.704], [77.105, 28.704], [77.105, 28.702], [77.102, 28.704]]]}`}
            className="w-full rounded-md border border-slate-200 p-2 font-mono text-[11px] bg-slate-50/50 focus:border-gov-navy focus:outline-none"
          />
        </div>

        {/* Section 5: Cadastral Parcels */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gov-slate">Cadastral Land Parcels (Survey Units)</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddParcel}
              leftIcon={<Plus className="h-3 w-3" />}
            >
              Add Parcel
            </Button>
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {parcels.map((p, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded border border-slate-200"
              >
                <div className="col-span-3">
                  <input
                    type="text"
                    placeholder="Survey #"
                    value={p.survey_number}
                    onChange={(e) => handleParcelChange(idx, 'survey_number', e.target.value)}
                    className="w-full border rounded p-1 text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="text"
                    placeholder="Khata #"
                    value={p.khata_number}
                    onChange={(e) => handleParcelChange(idx, 'khata_number', e.target.value)}
                    className="w-full border rounded p-1 text-xs"
                  />
                </div>
                <div className="col-span-4">
                  <input
                    type="text"
                    placeholder="Landowners (comma separated)"
                    value={p.landowner_names}
                    onChange={(e) => handleParcelChange(idx, 'landowner_names', e.target.value)}
                    className="w-full border rounded p-1 text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Acres"
                    value={p.area_acres}
                    onChange={(e) => handleParcelChange(idx, 'area_acres', e.target.value)}
                    className="w-full border rounded p-1 text-xs"
                  />
                </div>
                <div className="col-span-1 text-right">
                  {parcels.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveParcel(idx)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Initialize Case &amp; Workflow
          </Button>
        </div>
      </form>
    </Modal>
  );
};
