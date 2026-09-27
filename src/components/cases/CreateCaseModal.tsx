import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { SectionHeading } from '../common/SectionHeading';
import { Project, Workflow } from '../../../shared/types';
import { createCase } from '../../lib/api';
import { AdministrativeSelector } from '../common/AdministrativeSelector';
import { CreateProjectModal } from '../projects/CreateProjectModal';
import { Plus, Trash2, AlertCircle, Building2 } from 'lucide-react';

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
  const [localProjects, setLocalProjects] = useState<Project[]>(projects);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

  useEffect(() => {
    setLocalProjects(projects);
  }, [projects]);

  const [projectId, setProjectId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [district, setDistrict] = useState('');
  const [districtCode, setDistrictCode] = useState('');
  const [tehsil, setTehsil] = useState('');
  const [subDistrictCode, setSubDistrictCode] = useState('');
  const [village, setVillage] = useState('');
  const [villageCode, setVillageCode] = useState('');
  const [manualVillage, setManualVillage] = useState(false);
  const [totalArea, setTotalArea] = useState('');
  const [estimatedComp, setEstimatedComp] = useState('');
  const [priority, setPriority] = useState('medium');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [geojsonBoundaryText, setGeojsonBoundaryText] = useState('');

  // Parcel fields - clean empty initial row.
  // `land_type` starts empty on purpose: the column is NOT NULL in the
  // database but has no server-defined enum, so pre-filling it would invent a
  // fact about the land that nobody entered.
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
      land_type: '',
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
        land_type: '',
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
    if (
      !projectId ||
      !workflowId ||
      !title ||
      !stateCode ||
      !districtCode ||
      !subDistrictCode ||
      (!villageCode && !manualVillage)
    ) {
      setError('Please complete the project, workflow, and location fields.');
      return;
    }

    const totalAreaValue = Number(totalArea);
    if (!totalArea || !Number.isFinite(totalAreaValue) || totalAreaValue <= 0) {
      setError('Total area (hectares) must be a positive number.');
      return;
    }

    // Drop rows the officer never touched, then validate the ones they did.
    // Every parcel field is reported as entered — never defaulted — because
    // `survey_number` is required server-side and `land_type` / `area_acres`
    // describe real land.
    const touchedParcels = parcels.filter((p) =>
      [p.survey_number, p.khata_number, p.landowner_names, p.land_type, p.area_acres].some(
        (v) => v.trim() !== ''
      )
    );

    for (let i = 0; i < touchedParcels.length; i++) {
      const p = touchedParcels[i];
      const parcelNo = i + 1;
      if (!p.survey_number.trim()) {
        setError(`Parcel ${parcelNo}: survey number is required.`);
        return;
      }
      if (!p.land_type.trim()) {
        setError(`Parcel ${parcelNo}: land type is required.`);
        return;
      }
      const acres = Number(p.area_acres);
      if (!p.area_acres || !Number.isFinite(acres) || acres < 0) {
        setError(`Parcel ${parcelNo}: area in acres must be a number.`);
        return;
      }
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

      const formattedParcels = touchedParcels.map((p) => ({
        survey_number: p.survey_number.trim(),
        khata_number: p.khata_number.trim() || undefined,
        landowner_names: p.landowner_names
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean),
        land_type: p.land_type.trim(),
        area_acres: Number(p.area_acres),
      }));

      await createCase({
        project_id: projectId,
        workflow_id: workflowId,
        title,
        description,
        state,
        state_lgd_code: stateCode,
        district,
        district_lgd_code: districtCode,
        tehsil,
        subdistrict_lgd_code: subDistrictCode,
        village,
        village_lgd_code: manualVillage ? undefined : villageCode,
        total_area_hectares: totalAreaValue,
        // Omitted rather than sent as 0 when the officer leaves it blank, so an
        // unknown estimate is never recorded as "compensation = 0".
        estimated_compensation:
          estimatedComp.trim() && Number.isFinite(Number(estimatedComp))
            ? Number(estimatedComp)
            : undefined,
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
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Section 1: Case information */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-gov">
          <SectionHeading
            title="Case Information"
            hint="Assign the case to existing project and workflow records."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="case-project" className="label label-required mb-0">
                  Infrastructure Project
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreateProjectOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-gov-navy hover:text-gov-blue hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  Create Project
                </button>
              </div>
              <select
                id="case-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
                className="input"
              >
                <option value="">
                  {localProjects.length === 0 ? '-- No Projects (Click + Create Project) --' : '-- Select Sponsoring Project --'}
                </option>
                {localProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="case-workflow" className="label label-required">
                Workflow Engine Model
              </label>
              <select
                id="case-workflow"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
                required
                className="input"
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

          <div>
            <label htmlFor="case-title" className="label label-required">
              Case Title
            </label>
            <input
              id="case-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Talegaon Multi-Modal Interchange Parcel A"
              required
              className="input"
            />
          </div>
        </section>

        {/* Section 2: administrative location */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-gov">
          <SectionHeading
            title="Administrative Location"
            hint="Select each level from the loaded hierarchy. Child lists are constrained by the parent code."
          />
          <AdministrativeSelector
            selectedStateCode={stateCode}
            selectedDistrictCode={districtCode}
            selectedSubDistrictCode={subDistrictCode}
            selectedVillageCode={villageCode}
            onSelectState={(unit) => {
              setStateCode(unit?.code ?? '');
              setState(unit?.name ?? '');
              setDistrictCode('');
              setDistrict('');
              setSubDistrictCode('');
              setTehsil('');
              setVillageCode('');
              setVillage('');
            }}
            onSelectDistrict={(unit) => {
              setDistrictCode(unit?.code ?? '');
              setDistrict(unit?.name ?? '');
              setSubDistrictCode('');
              setTehsil('');
              setVillageCode('');
              setVillage('');
            }}
            onSelectSubDistrict={(unit) => {
              setSubDistrictCode(unit?.code ?? '');
              setTehsil(unit?.name ?? '');
              setVillageCode('');
              setVillage('');
            }}
            onSelectVillage={(unit) => {
              const isTyped = Boolean(unit && unit.source_id === 'manual_entry');
              setManualVillage(isTyped);
              setVillageCode(isTyped ? '' : unit?.code ?? '');
              setVillage(unit?.name ?? '');
            }}
          />
        </section>

        {/* Section 3: Quantitative & Timeline */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-gov">
          <SectionHeading title="Acquisition Details" hint="Area, compensation, priority & timeline" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor="case-area" className="label label-required">
                Area (Hectares)
              </label>
              <input
                id="case-area"
                type="number"
                step="0.01"
                value={totalArea}
                onChange={(e) => setTotalArea(e.target.value)}
                required
                className="input input-xs"
              />
            </div>
            <div>
              <label htmlFor="case-comp" className="label">
                Estimated Comp (₹)
              </label>
              <input
                id="case-comp"
                type="number"
                value={estimatedComp}
                onChange={(e) => setEstimatedComp(e.target.value)}
                className="input input-xs"
              />
            </div>
            <div>
              <label htmlFor="case-priority" className="label">
                Priority
              </label>
              <select
                id="case-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="input input-xs"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label htmlFor="case-start-date" className="label">
                Start Date
              </label>
              <input
                id="case-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input input-xs"
              />
            </div>
          </div>
        </section>

        {/* Section 4: Spatial details */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-gov">
          <SectionHeading title="Spatial Details" hint="WGS84 Polygon / Feature" />
          <div>
            <label htmlFor="case-geojson" className="label">
              Corridor Spatial Boundary (GeoJSON - Optional)
            </label>
            <textarea
              id="case-geojson"
              rows={3}
              value={geojsonBoundaryText}
              onChange={(e) => setGeojsonBoundaryText(e.target.value)}
              placeholder={`{"type": "Polygon", "coordinates": [[[77.102, 28.704], [77.105, 28.704], [77.105, 28.702], [77.102, 28.704]]]}`}
              className="input font-mono text-[11px]"
            />
          </div>
        </section>

        {/* Section 5: Cadastral parcels */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-gov">
          <SectionHeading
            title="Cadastral Land Parcels (Survey Units)"
            hint="Survey numbers, khata records & landowners"
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddParcel}
                leftIcon={<Plus className="h-3 w-3" />}
              >
                Add Parcel
              </Button>
            }
          />

          <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
            {parcels.map((p, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-2"
              >
                <div className="col-span-2">
                  <input
                    type="text"
                    placeholder="Survey #"
                    value={p.survey_number}
                    onChange={(e) => handleParcelChange(idx, 'survey_number', e.target.value)}
                    className="input input-xs"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="text"
                    placeholder="Khata #"
                    value={p.khata_number}
                    onChange={(e) => handleParcelChange(idx, 'khata_number', e.target.value)}
                    className="input input-xs"
                  />
                </div>
                <div className="col-span-3">
                  <input
                    type="text"
                    placeholder="Landowners (comma separated)"
                    value={p.landowner_names}
                    onChange={(e) => handleParcelChange(idx, 'landowner_names', e.target.value)}
                    className="input input-xs"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="text"
                    placeholder="Land type"
                    aria-label={`Parcel ${idx + 1} land type`}
                    value={p.land_type}
                    onChange={(e) => handleParcelChange(idx, 'land_type', e.target.value)}
                    className="input input-xs"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Acres"
                    value={p.area_acres}
                    onChange={(e) => handleParcelChange(idx, 'area_acres', e.target.value)}
                    className="input input-xs"
                  />
                </div>
                <div className="col-span-1 text-right">
                  {parcels.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveParcel(idx)}
                      aria-label={`Remove parcel ${idx + 1}`}
                      className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer Actions */}
        <div className="sticky bottom-[-1.25rem] flex items-center justify-end gap-2 border-t border-slate-100 bg-white py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Initialize Case &amp; Workflow
          </Button>
        </div>
      </form>

      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        defaultStateCode={stateCode}
        defaultDistrictCode={districtCode}
        onProjectCreated={(newProj) => {
          setLocalProjects((prev) => [newProj, ...prev]);
          setProjectId(newProj.id);
          setIsCreateProjectOpen(false);
        }}
      />
    </Modal>
  );
};
