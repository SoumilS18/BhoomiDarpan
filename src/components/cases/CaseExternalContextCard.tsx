import React, { useState, useEffect } from 'react';
import {
  fetchCaseExternalContext,
} from '../../lib/api';
import {
  CaseExternalContextBundle,
} from '../../../shared/types';
import { Card, CardHeader, CardContent } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import {
  CloudSun,
  Thermometer,
  Wind,
  Droplets,
  CloudRain,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  ShieldCheck,
  Activity,
  Layers,
} from 'lucide-react';
import { clsx } from 'clsx';

interface CaseExternalContextCardProps {
  caseId: string;
}

export const CaseExternalContextCard: React.FC<CaseExternalContextCardProps> = ({ caseId }) => {
  const [bundle, setBundle] = useState<CaseExternalContextBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isQualityOpen, setIsQualityOpen] = useState(false);
  const [dataStreamMode, setDataStreamMode] = useState<'EXTERNAL_DATA_REFRESH' | 'CACHED_DATA'>('CACHED_DATA');

  const loadContext = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await fetchCaseExternalContext(caseId, forceRefresh);
      setBundle(data);
      setDataStreamMode(forceRefresh ? 'EXTERNAL_DATA_REFRESH' : 'CACHED_DATA');
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve external context');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadContext(false);
  }, [caseId]);

  if (loading) {
    return (
      <Card className="border-slate-200">
        <div className="p-6 flex items-center justify-center space-x-3 text-slate-500">
          <RefreshCw className="h-5 w-5 animate-spin text-gov-navy" />
          <span className="text-xs font-medium">Resolving live multi-source external context...</span>
        </div>
      </Card>
    );
  }

  if (error || !bundle) {
    return (
      <Card className="border-slate-200 bg-red-50/40">
        <div className="p-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-red-700">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{error || 'External context unavailable'}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadContext(true)}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const { weather, discrepancies, intelligence_impact, coordinates, location_source } = bundle;
  const observation = weather?.observation;
  const values = observation?.normalized_values || {};
  const freshness = weather?.freshness;
  const quality = weather?.quality;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader
        className="bg-gradient-to-r from-slate-50 to-blue-50/30 border-b border-slate-200/80 px-5 py-3.5"
        title={
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 text-gov-navy rounded-lg inline-flex">
              <CloudSun className="h-4 w-4" />
            </div>
            <span className="text-xs font-bold text-gov-navy uppercase tracking-wider">
              External Context &amp; Environmental Intelligence
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              {dataStreamMode === 'EXTERNAL_DATA_REFRESH' ? 'LIVE SYNC' : 'CACHED OBSERVATION'}
            </span>
          </div>
        }
        subtitle="Multi-source atmospheric, spatial and discrepancy signals associated to case location"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadContext(true)}
            isLoading={refreshing}
            leftIcon={<RefreshCw className="h-3 w-3" />}
            className="text-xs py-1 px-2.5 h-7"
          >
            Sync Now
          </Button>
        }
      />

      <CardContent className="p-5 space-y-4">
        {/* Top Badges & Location Provenance Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-2 border-b border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Source Badge */}
            <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Source: {observation?.provider || 'Open-Meteo'}
            </span>

            {/* Freshness Badge */}
            {freshness && (
              <Badge
                variant={
                  freshness.state === 'fresh'
                    ? 'emerald'
                    : freshness.state === 'aging'
                    ? 'amber'
                    : 'red'
                }
              >
                {freshness.freshness_label}
              </Badge>
            )}

            {/* Location Source */}
            {coordinates ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                <MapPin className="h-3 w-3 text-blue-600" />
                <span>
                  {location_source === 'case_boundary'
                    ? 'Case GIS Centroid'
                    : location_source === 'parcel_geometry'
                    ? 'Parcel Geometry'
                    : 'Geocoded Village'}
                  : [{coordinates.latitude.toFixed(4)}, {coordinates.longitude.toFixed(4)}]
                </span>
              </span>
            ) : (
              <Badge variant="amber">GIS Coordinates Unavailable</Badge>
            )}
          </div>

          {/* Quality Score Trigger */}
          {quality && (
            <button
              onClick={() => setIsQualityOpen(!isQualityOpen)}
              className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-gov-navy font-medium px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Data Quality:</span>
              <strong className={quality.overall_score >= 70 ? 'text-emerald-700' : 'text-amber-700'}>
                {quality.overall_score}/100
              </strong>
              {isQualityOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>

        {/* Stale / Fallback Notice Banner if applicable */}
        {(weather?.freshness?.is_stale || weather?.status === 'stale') && (
          <div className="flex items-start gap-2.5 p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">Weather Provider Offline or Cache Expired</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                {weather.message} Displaying last verified observation. Stale observations are strictly excluded from statutory risk scores.
              </p>
            </div>
          </div>
        )}

        {/* Live Weather Metrics Grid */}
        {observation ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px] mb-1">
                <Thermometer className="h-3.5 w-3.5 text-rose-500" />
                <span>Temperature</span>
              </div>
              <div className="text-base font-bold text-slate-800">
                {values.temperature_c !== undefined ? `${values.temperature_c}°C` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">2m Ground Level</div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px] mb-1">
                <CloudRain className="h-3.5 w-3.5 text-blue-500" />
                <span>Precipitation</span>
              </div>
              <div className="text-base font-bold text-slate-800">
                {values.precipitation_mm !== undefined ? `${values.precipitation_mm} mm` : '0 mm'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">Current hour</div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px] mb-1">
                <Wind className="h-3.5 w-3.5 text-teal-500" />
                <span>Wind Speed</span>
              </div>
              <div className="text-base font-bold text-slate-800">
                {values.wind_speed_kmh !== undefined ? `${values.wind_speed_kmh} km/h` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">10m Surface</div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px] mb-1">
                <Droplets className="h-3.5 w-3.5 text-indigo-500" />
                <span>Humidity</span>
              </div>
              <div className="text-base font-bold text-slate-800">
                {values.relative_humidity_pct !== undefined ? `${values.relative_humidity_pct}%` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">Relative</div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px] mb-1">
                <Activity className="h-3.5 w-3.5 text-amber-500" />
                <span>Condition</span>
              </div>
              <div className="text-xs font-bold text-slate-800 truncate" title={values.weather_condition}>
                {values.weather_condition || 'Normal'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {values.weather_code !== undefined ? `WMO ${values.weather_code}` : 'Verified'}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-lg text-center text-xs text-slate-500">
            {weather?.message || 'No weather observations available for this case location.'}
          </div>
        )}

        {/* Explainable Data Quality Breakdown (Collapsible) */}
        {isQualityOpen && quality && (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Transparent Data Quality Audit
              </span>
              <span className="text-xs font-mono font-bold text-slate-700">
                Score: {quality.overall_score} / 100
              </span>
            </div>
            <p className="text-xs text-slate-600">{quality.summary}</p>

            <div className="space-y-2 pt-1">
              {quality.dimensions.map((dim, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 text-xs bg-white p-2.5 rounded border border-slate-100">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-medium text-slate-700">
                      {dim.status === 'passed' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      ) : dim.status === 'warning' ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                      )}
                      <span>{dim.dimension}</span>
                      <span className="text-[10px] text-slate-400">({Math.round(dim.weight * 100)}% wt)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 pl-5">{dim.explanation}</p>
                  </div>
                  <div className="font-mono text-xs font-bold text-slate-700 shrink-0">
                    {dim.score}/100
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cross-Source Discrepancies Section */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-gov-navy" />
              Cross-Source Discrepancy Checks
            </span>
            <span className="text-[11px] text-slate-500">
              {discrepancies.status === 'insufficient_sources'
                ? 'Single Source Available'
                : discrepancies.items.length === 0
                ? 'All Sources Consistent'
                : `${discrepancies.items.length} Discrepancy Flagged`}
            </span>
          </div>

          {discrepancies.status === 'insufficient_sources' ? (
            <div className="p-2.5 bg-slate-50 rounded border border-slate-200/60 text-xs text-slate-500 flex items-center gap-2">
              <HelpCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>{discrepancies.message}</span>
            </div>
          ) : discrepancies.items.length > 0 ? (
            <div className="space-y-2">
              {discrepancies.items.map((disc, idx) => (
                <div key={idx} className="p-3 bg-red-50/50 border border-red-200 rounded-lg text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-red-800 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                      Field Mismatch: {disc.compared_field.toUpperCase()}
                    </span>
                    <Badge variant="red">{disc.severity.toUpperCase()}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="bg-white p-2 rounded border border-red-100">
                      <span className="font-mono text-[10px] text-slate-400">{disc.source_a}:</span>
                      <div className="font-semibold text-slate-800">{JSON.stringify(disc.value_a)}</div>
                    </div>
                    <div className="bg-white p-2 rounded border border-red-100">
                      <span className="font-mono text-[10px] text-slate-400">{disc.source_b}:</span>
                      <div className="font-semibold text-slate-800">{JSON.stringify(disc.value_b)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-50/50 rounded border border-emerald-100 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Cross-source comparison verified: spatial coordinates and boundaries match across records.</span>
            </div>
          )}
        </div>

        {/* Intelligence Link & Decision Support Footer */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50/40 border border-blue-100 text-xs">
            <Activity className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-gov-navy">Decision Support Impact: </span>
              <span className="text-slate-600">{intelligence_impact.reason}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
