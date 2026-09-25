import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { createParcel } from '../../lib/api';
import { Plus, AlertCircle, CheckCircle } from 'lucide-react';

interface AddParcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess: () => void;
}

export const AddParcelModal: React.FC<AddParcelModalProps> = ({
  isOpen,
  onClose,
  caseId,
  onSuccess,
}) => {
  const [surveyNumber, setSurveyNumber] = useState('');
  const [khataNumber, setKhataNumber] = useState('');
  const [landownerNames, setLandownerNames] = useState('');
  const [landType, setLandType] = useState('Agricultural');
  const [areaAcres, setAreaAcres] = useState('');
  const [compensationAmount, setCompensationAmount] = useState('');
  const [acquisitionStatus, setAcquisitionStatus] = useState('identified');
  const [geojsonText, setGeojsonText] = useState('');
  const [actorName, setActorName] = useState('Revenue Officer');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!surveyNumber.trim() || !areaAcres.trim() || !landownerNames.trim()) {
      setError('Survey Number, Landowner(s), and Area in Acres are required.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    let parsedGeom: any = undefined;
    if (geojsonText.trim()) {
      try {
        parsedGeom = JSON.parse(geojsonText);
      } catch (err: any) {
        setError(`Invalid Parcel GeoJSON syntax: ${err.message}`);
        setIsLoading(false);
        return;
      }
    }

    try {
      await createParcel(caseId, {
        survey_number: surveyNumber.trim(),
        khata_number: khataNumber.trim() || undefined,
        landowner_names: landownerNames
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean),
        land_type: landType,
        area_acres: parseFloat(areaAcres),
        compensation_amount: compensationAmount ? parseFloat(compensationAmount) : 0,
        acquisition_status: acquisitionStatus,
        geojson_geometry: parsedGeom,
        actorName,
      });

      setSuccessMsg(`Parcel ${surveyNumber} created and georeferenced successfully.`);
      setTimeout(() => {
        setIsLoading(false);
        onSuccess();
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || 'Failed to add parcel.');
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Demarcate Cadastral Parcel"
      subtitle="Register survey parcel holding, verified khata rights, and spatial polygon"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <div>{successMsg}</div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gov-slate mb-1">
              Survey Number *
            </label>
            <input
              type="text"
              required
              value={surveyNumber}
              onChange={(e) => setSurveyNumber(e.target.value)}
              placeholder="e.g. 104/2B"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-1 focus:ring-gov-navy focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gov-slate mb-1">
              Khata / Patta Number
            </label>
            <input
              type="text"
              value={khataNumber}
              onChange={(e) => setKhataNumber(e.target.value)}
              placeholder="e.g. KH-4410"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-1 focus:ring-gov-navy focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gov-slate mb-1">
            Registered Landowner(s) * (comma-separated)
          </label>
          <input
            type="text"
            required
            value={landownerNames}
            onChange={(e) => setLandownerNames(e.target.value)}
            placeholder="e.g. Ramesh Chandra Sharma, Suresh Kumar"
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-gov-navy focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gov-slate mb-1">
              Land Classification
            </label>
            <select
              value={landType}
              onChange={(e) => setLandType(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-gov-navy focus:outline-none"
            >
              <option value="Agricultural">Agricultural</option>
              <option value="Commercial">Commercial</option>
              <option value="Residential">Residential</option>
              <option value="Industrial">Industrial</option>
              <option value="Forest">Forest</option>
              <option value="Barren/Waste">Barren/Waste</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gov-slate mb-1">
              Area (Acres) *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={areaAcres}
              onChange={(e) => setAreaAcres(e.target.value)}
              placeholder="e.g. 2.45"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-gov-navy focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gov-slate mb-1">
              Estimated Comp. (₹)
            </label>
            <input
              type="number"
              value={compensationAmount}
              onChange={(e) => setCompensationAmount(e.target.value)}
              placeholder="e.g. 1500000"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-gov-navy focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gov-slate mb-1">
            Acquisition Status
          </label>
          <select
            value={acquisitionStatus}
            onChange={(e) => setAcquisitionStatus(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-gov-navy focus:outline-none capitalize"
          >
            <option value="identified">Identified</option>
            <option value="notified">Notified</option>
            <option value="valued">Valued</option>
            <option value="awarded">Awarded</option>
            <option value="disbursed">Disbursed</option>
            <option value="possessed">Possessed</option>
            <option value="disputed">Disputed</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gov-slate mb-1">
            Optional Cadastral Spatial Polygon (GeoJSON)
          </label>
          <textarea
            rows={4}
            value={geojsonText}
            onChange={(e) => setGeojsonText(e.target.value)}
            placeholder={`{\n  "type": "Polygon",\n  "coordinates": [[[77.102, 28.704], [77.104, 28.704], [77.104, 28.702], [77.102, 28.704]]]\n}`}
            className="w-full font-mono text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-gov-navy bg-slate-50"
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="w-1/2">
            <input
              type="text"
              value={actorName}
              onChange={(e) => setActorName(e.target.value)}
              placeholder="Officer Name"
              className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isLoading}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {isLoading ? 'Registering...' : 'Add Parcel'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
