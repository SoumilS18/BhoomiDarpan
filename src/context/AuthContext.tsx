import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, UserProfile } from '../../shared/types';

export interface PersonaOption {
  role: UserRole;
  label: string;
  name: string;
  department: string;
  badgeColor: string;
}

export const AVAILABLE_PERSONAS: PersonaOption[] = [
  {
    role: 'lao',
    label: 'Land Acquisition Officer (LAO)',
    name: 'Dr. Vikramaditya Rao, IAS',
    department: 'District Revenue & Land Acquisition Office',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    role: 'project_officer',
    label: 'Project Nodal Officer',
    name: 'Er. Rajesh Nair',
    department: 'National Infrastructure Development Authority',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  {
    role: 'revenue_inspector',
    label: 'Revenue Inspector / Surveyor',
    name: 'Suresh Patil',
    department: 'Tehsil Land Survey Office',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    role: 'approver',
    label: 'State Competent Authority',
    name: 'Smt. Ananya Deshmukh',
    department: 'Ministry of Infrastructure & Urban Development',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  {
    role: 'admin',
    label: 'System Administrator',
    name: 'BhoomiSetu Administrator',
    department: 'National Informatics Centre (NIC)',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
  },
];

interface AuthContextType {
  activePersona: PersonaOption;
  setActivePersona: (persona: PersonaOption) => void;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

import { setApiPersona } from '../lib/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePersona, setActivePersonaState] = useState<PersonaOption>(AVAILABLE_PERSONAS[0]);

  useEffect(() => {
    setApiPersona(activePersona.role, activePersona.name);
  }, [activePersona]);

  const setActivePersona = (persona: PersonaOption) => {
    setActivePersonaState(persona);
    setApiPersona(persona.role, persona.name);
  };

  const switchRole = (role: UserRole) => {
    const found = AVAILABLE_PERSONAS.find((p) => p.role === role);
    if (found) {
      setActivePersona(found);
    }
  };

  return (
    <AuthContext.Provider value={{ activePersona, setActivePersona, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
