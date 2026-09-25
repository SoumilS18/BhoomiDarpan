import React from 'react';
import { PortfolioOperationsData } from '../../../shared/types';
import { Card, CardHeader, CardContent } from '../common/Card';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface PortfolioVisualizationsProps {
  distributions: PortfolioOperationsData['distributions'];
  totalCases: number;
}

export const PortfolioVisualizations: React.FC<PortfolioVisualizationsProps> = ({
  distributions,
  totalCases,
}) => {
  if (totalCases === 0) {
    return null;
  }

  // Risk Distribution Data
  const riskData = Object.entries(distributions.by_risk)
    .filter(([_, count]) => count > 0)
    .map(([level, count]) => ({
      name: level.toUpperCase(),
      value: count,
    }));

  const RISK_COLORS: Record<string, string> = {
    CRITICAL: '#dc2626',
    HIGH: '#d97706',
    MEDIUM: '#2563eb',
    LOW: '#059669',
  };

  // Stage Distribution Data (top 6 stages)
  const stageData = (distributions.by_stage || []).slice(0, 6).map((s) => ({
    name: s.stage_title.length > 18 ? `${s.stage_title.slice(0, 16)}...` : s.stage_title,
    fullName: s.stage_title,
    cases: s.count,
  }));

  // Delay Distribution Data
  const delayData = [
    { bucket: 'On Schedule', count: distributions.delay_buckets.on_time, color: '#059669' },
    { bucket: '1-15 Days', count: distributions.delay_buckets.minor_1_15d, color: '#3b82f6' },
    { bucket: '16-30 Days', count: distributions.delay_buckets.moderate_16_30d, color: '#f59e0b' },
    { bucket: '> 30 Days', count: distributions.delay_buckets.severe_over_30d, color: '#dc2626' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 1. Portfolio Risk Distribution */}
      <Card>
        <CardHeader
          title="Portfolio Risk Profile"
          subtitle="Calculated multi-factor risk categorization"
        />
        <CardContent>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskData}
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={62}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {riskData.map((entry) => (
                    <Cell key={entry.name} fill={RISK_COLORS[entry.name] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => [`${value} Cases`, 'Volume']}
                  contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100 text-[11px]">
            {riskData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: RISK_COLORS[d.name] || '#64748b' }}
                />
                <span className="text-slate-600 truncate">
                  {d.name}: <strong>{d.value}</strong>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2. Cases by Current Milestone */}
      <Card>
        <CardHeader
          title="Milestone Distribution"
          subtitle="Active cases across workflow stages"
        />
        <CardContent>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={85} tick={{ fontSize: 9 }} />
                <Tooltip
                  formatter={(value: any, _: any, item: any) => [`${value} Cases`, item.payload.fullName]}
                  contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                />
                <Bar dataKey="cases" fill="#1e3a8a" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 3. Delay Distribution Buckets */}
      <Card>
        <CardHeader
          title="Schedule SLA Variance"
          subtitle="Delay distribution across active portfolio"
        />
        <CardContent>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={delayData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                <XAxis dataKey="bucket" tick={{ fontSize: 9 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: any) => [`${value} Cases`, 'Volume']}
                  contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={24}>
                  {delayData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
