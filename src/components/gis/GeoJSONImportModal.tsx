import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { updateCaseGeoJSON } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Upload, AlertCircle, CheckCircle, FileText, Code } from 'lucide-react';

interface GeoJSONImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess: () => void;
}

export const GeoJSONImportModal: React.FC<GeoJSONImportModalProps> = ({
  isOpen,
  onClose,
  caseId,
  onSuccess,
}) => {
  const [jsonText, setJsonText] = useState('');
  // Audit actor follows the signed-in identity and is not user-editable.
  const { activePersona } = useAuth();
  const [actorName] = useState(activePersona.name);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonText(content);
      setError(null);
    };
    reader.onerror = () => {
      setError('Failed to read file from disk.');
    };
    reader.readAsText(file);
  };

  const handleFormatJSON = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch (err: any) {
      setError(`Cannot format: ${err.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonText.trim()) {
      setError('Please provide GeoJSON text or upload a .geojson file.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    let parsedGeoJSON: any;
    try {
      parsedGeoJSON = JSON.parse(jsonText);
    } catch (err: any) {
      setError(`Invalid JSON syntax: ${err.message}`);
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await updateCaseGeoJSON(caseId, parsedGeoJSON, actorName);
      setSuccessMsg(res.message || 'Spatial corridor geometry saved and validated successfully!');
      setTimeout(() => {
        setIsSubmitting(false);
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to update case GeoJSON.');
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Statutory Case GeoJSON Corridor"
      subtitle="Upload or paste compliant WGS-84 GeoJSON Polygon, MultiPolygon, or FeatureCollection"
      maxWidth="2xl"
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

        <div>
          <label className="block text-xs font-semibold text-gov-slate mb-1">
            Upload .geojson or .json File
          </label>
          <input
            type="file"
            accept=".geojson,.json,application/json"
            onChange={handleFileUpload}
            className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-gov-navy hover:file:bg-blue-100 cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gov-slate">
            Paste GeoJSON Specification
          </label>
          <button
            type="button"
            onClick={handleFormatJSON}
            className="text-[11px] text-gov-navy hover:underline flex items-center gap-1 font-medium"
          >
            <Code className="h-3 w-3" /> Format JSON
          </button>
        </div>

        <textarea
          rows={10}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder={`{\n  "type": "Feature",\n  "properties": { "name": "Bhoomi Corridor" },\n  "geometry": {\n    "type": "Polygon",\n    "coordinates": [\n      [\n        [77.1025, 28.7041],\n        [77.1050, 28.7045],\n        [77.1060, 28.7020],\n        [77.1025, 28.7041]\n      ]\n    ]\n  }\n}`}
          className="w-full font-mono text-xs p-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-gov-navy/20 focus:border-gov-navy bg-slate-50"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gov-slate mb-1">
              Recorded As (Audit Actor)
            </label>
            <input
              type="text"
              value={actorName}
              readOnly
              aria-readonly="true"
              title="Taken from the signed-in profile; cannot be edited"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-600 focus:outline-none"
            />
          </div>

          <div className="flex items-end justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting || !jsonText.trim()}
              leftIcon={<Upload className="h-4 w-4" />}
            >
              {isSubmitting ? 'Validating & Saving...' : 'Save Corridor GeoJSON'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
