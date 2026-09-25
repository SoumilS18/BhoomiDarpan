import React, { useState } from 'react';
import { useAuth, AVAILABLE_PERSONAS } from '../../context/AuthContext';
import { Shield, ChevronDown, Check } from 'lucide-react';

export const RoleSwitcher: React.FC = () => {
  const { activePersona, setActivePersona } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-sm text-left"
        title="Switch active persona to test role-based access"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gov-navy/10 text-gov-navy font-bold text-xs">
          <Shield className="h-4 w-4" />
        </div>
        <div className="hidden md:block text-left">
          <div className="text-xs font-semibold text-gov-slate leading-tight flex items-center gap-1.5">
            <span>{activePersona.label}</span>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </div>
          <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
            {activePersona.name}
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400 ml-1" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 rounded-xl bg-white border border-slate-200 shadow-xl z-30 py-2 divide-y divide-slate-100">
            <div className="px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Evaluation Persona Switcher
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Simulates UI views for testing officer roles.
              </p>
              <div className="mt-1.5 p-1.5 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-800">
                <strong>Security Architecture:</strong> In production, role authorization is strictly enforced server-side via Supabase JWT sessions &amp; PostgreSQL RLS.
              </div>
            </div>
            <div className="py-1">
              {AVAILABLE_PERSONAS.map((p) => {
                const isSelected = p.role === activePersona.role;
                return (
                  <button
                    key={p.role}
                    onClick={() => {
                      setActivePersona(p);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-50 transition-colors ${
                      isSelected ? 'bg-slate-50/80' : ''
                    }`}
                  >
                    <div className={`mt-0.5 rounded-md p-1 ${isSelected ? 'bg-gov-navy text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <Shield className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gov-slate flex items-center justify-between">
                        <span>{p.label}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-gov-emerald" />}
                      </div>
                      <div className="text-[11px] text-slate-600 truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{p.department}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
