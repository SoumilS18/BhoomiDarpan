import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { SectionHeading } from '../common/SectionHeading';
import { Project, AdministrativeUnit } from '../../../shared/types';
import { createProject, fetchStates, fetchDistricts } from '../../lib/api';
import { Building2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (project: Project) => void;
  defaultStateCode?: string;
  defaultDistrictCode?: string;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
  defaultStateCode,
  defaultDistrictCode,
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [projectType, setProjectType] = useState<string>('highway');
  const [sponsoringAgency, setSponsoringAgency] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedBudgetCr, setEstimatedBudgetCr] = useState('');
  const [targetCompletionDate, setTargetCompletionDate] = useState('');

  const [stateName, setStateName] = useState('');
  const [stateLgdCode, setStateLgdCode] = useState(defaultStateCode || '');
  const [districtName, setDistrictName] = useState('');
  const [districtLgdCode, setDistrictLgdCode] = useState(defaultDistrictCode || '');

  const [states, setStates] = useState<AdministrativeUnit[]>([]);
  const [districts, setDistricts] = useState<AdministrativeUnit[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccess(false);
      return;
    }

    setLoadingStates(true);
    fetchStates()
      .then((res) => {
        const list = res.states || [];
        setStates(list);
        if (defaultStateCode) {
          const matching = list.find((s) => s.code === defaultStateCode);
          if (matching) {
            setStateName(matching.name);
            setStateLgdCode(matching.code);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingStates(false));
  }, [isOpen, defaultStateCode]);

  useEffect(() => {
    if (!stateLgdCode) {
      setDistricts([]);
      setDistrictName('');
      setDistrictLgdCode('');
      return;
    }

    setLoadingDistricts(true);
    fetchDistricts(stateLgdCode)
      .then((res) => {
        const list = res.districts || [];
        setDistricts(list);
        if (defaultDistrictCode) {
          const matching = list.find((d) => d.code === defaultDistrictCode);
          if (matching) {
            setDistrictName(matching.name);
            setDistrictLgdCode(matching.code);
          }
        }
      })
      .catch(() => setDistricts([]))
      .finally(() => setLoadingDistricts(false));
  }, [stateLgdCode, defaultDistrictCode]);

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCode = e.target.value;
    setStateLgdCode(selectedCode);
    const found = states.find((s) => s.code === selectedCode);
    setStateName(found ? found.name : '');
    setDistrictLgdCode('');
    setDistrictName('');
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCode = e.target.value;
    setDistrictLgdCode(selectedCode);
    const found = districts.find((d) => d.code === selectedCode);
    setDistrictName(found ? found.name : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim();
    const cleanName = name.trim();
    const cleanAgency = sponsoringAgency.trim();
    const cleanState = stateName.trim();

    if (!cleanCode || !cleanName || !cleanAgency || !cleanState) {
      setError('Please provide Project Code, Project Name, Sponsoring Agency, and State.');
      return;
    }

    const budgetNumber = estimatedBudgetCr ? parseFloat(estimatedBudgetCr) * 10000000 : null;

    setIsSubmitting(true);
    try {
      const res = await createProject({
        code: cleanCode,
        name: cleanName,
        project_type: projectType,
        sponsoring_agency: cleanAgency,
        description: description.trim() || undefined,
        estimated_budget: budgetNumber,
        target_completion_date: targetCompletionDate || null,
        state: cleanState,
        district: districtName.trim() || null,
        state_lgd_code: stateLgdCode || null,
        district_lgd_code: districtLgdCode || null,
      });

      setSuccess(true);
      onProjectCreated(res.project);
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Failed to create infrastructure project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Infrastructure Project"
      subtitle="Register a sponsoring infrastructure project corridor backed by PostgreSQL"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Infrastructure project registered successfully!</span>
          </div>
        )}

        {/* Section 1: Project Identity */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-gov">
          <SectionHeading
            title="Project Identity & Sponsoring Authority"
            hint="Official code, name, and statutory sponsoring department"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="proj-code" className="label label-required">
                Project Identifier Code
              </label>
              <input
                id="proj-code"
                type="text"
                required
                placeholder="e.g. NH-48-EXP, DMRC-PH4"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="input font-mono text-xs uppercase"
              />
            </div>

            <div>
              <label htmlFor="proj-type" className="label label-required">
                Infrastructure Category
              </label>
              <select
                id="proj-type"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                required
                className="input text-xs"
              >
                <option value="highway">National / State Highway</option>
                <option value="railway">Railway & Freight Corridor</option>
                <option value="irrigation">Irrigation & Canal System</option>
                <option value="metro">Metro Rail Transit</option>
                <option value="industrial">Industrial Park / Corridor</option>
                <option value="urban">Urban Development & Smart City</option>
                <option value="energy">Energy & Transmission Grid</option>
                <option value="airport">Airport & Civil Aviation</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="proj-name" className="label label-required">
              Project Name / Title
            </label>
            <input
              id="proj-name"
              type="text"
              required
              placeholder="e.g. Delhi-Mumbai Expressway Corridor Phase II"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input text-xs"
            />
          </div>

          <div>
            <label htmlFor="proj-agency" className="label label-required">
              Sponsoring Agency / Authority
            </label>
            <input
              id="proj-agency"
              type="text"
              required
              placeholder="e.g. NHAI, MoRTH, DFCCIL, State PWD"
              value={sponsoringAgency}
              onChange={(e) => setSponsoringAgency(e.target.value)}
              className="input text-xs"
            />
          </div>
        </section>

        {/* Section 2: Location & Geographic Scope */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-gov">
          <SectionHeading
            title="Geographic Scope"
            hint="Primary State & District jurisdiction"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="proj-state" className="label label-required">
                State / UT
              </label>
              <select
                id="proj-state"
                value={stateLgdCode}
                onChange={handleStateChange}
                required
                disabled={loadingStates}
                className="input text-xs"
              >
                <option value="">-- Select State / UT --</option>
                {states.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} (LGD: {s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="proj-district" className="label">
                District (Optional)
              </label>
              <select
                id="proj-district"
                value={districtLgdCode}
                onChange={handleDistrictChange}
                disabled={!stateLgdCode || loadingDistricts}
                className="input text-xs"
              >
                <option value="">
                  {!stateLgdCode ? 'Select State first' : '-- Select District (or multi-district) --'}
                </option>
                {districts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name} (LGD: {d.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Section 3: Budget & Timeline */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-gov">
          <SectionHeading
            title="Budget, Timeline & Scope"
            hint="Estimated land acquisition outlay and target schedule"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="proj-budget" className="label">
                Estimated Outlay (₹ Crores)
              </label>
              <input
                id="proj-budget"
                type="number"
                step="0.01"
                placeholder="e.g. 250.50"
                value={estimatedBudgetCr}
                onChange={(e) => setEstimatedBudgetCr(e.target.value)}
                className="input text-xs"
              />
            </div>

            <div>
              <label htmlFor="proj-target-date" className="label">
                Target Completion Date
              </label>
              <input
                id="proj-target-date"
                type="date"
                value={targetCompletionDate}
                onChange={(e) => setTargetCompletionDate(e.target.value)}
                className="input text-xs"
              />
            </div>
          </div>

          <div>
            <label htmlFor="proj-desc" className="label">
              Project Description / Corridor Notes
            </label>
            <textarea
              id="proj-desc"
              rows={2}
              placeholder="Brief summary of alignment, corridor span, or special statutory provisions..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input text-xs"
            />
          </div>
        </section>

        {/* Footer Actions */}
        <div className="sticky bottom-[-1.25rem] flex items-center justify-end gap-2 border-t border-slate-100 bg-white py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} leftIcon={<Building2 className="h-4 w-4" />}>
            Register Project
          </Button>
        </div>
      </form>
    </Modal>
  );
};
