import { describe, test, expect } from 'bun:test';
import { DEMO_ROLE_ACCOUNTS, DEMO_ACCOUNTS_MAP } from '../src/lib/demoAccounts';
import type { UserRole } from '../shared/types';
import fs from 'node:fs';
import path from 'node:path';

describe('Demo Role Accounts Verification for Hackathon Evaluation', () => {
  const expectedRoles: UserRole[] = [
    'lao',
    'project_officer',
    'revenue_inspector',
    'approver',
    'legal_officer',
    'admin',
    'viewer',
  ];

  test('provisions all 7 distinct user roles for evaluation', () => {
    expect(DEMO_ROLE_ACCOUNTS.length).toBe(7);
    const rolesInList = DEMO_ROLE_ACCOUNTS.map((a) => a.role);
    for (const role of expectedRoles) {
      expect(rolesInList).toContain(role);
    }
  });

  test('maps each role in DEMO_ACCOUNTS_MAP accurately', () => {
    for (const role of expectedRoles) {
      const account = DEMO_ACCOUNTS_MAP[role];
      expect(account).toBeDefined();
      expect(account.role).toBe(role);
      expect(account.email).toBe(`demo-${role}@example.org`);
      expect(account.password.length).toBeGreaterThan(10);
      expect(account.roleLabel.length).toBeGreaterThan(0);
      expect(account.badgeLabel.length).toBeGreaterThan(0);
      expect(account.department.length).toBeGreaterThan(0);
      expect(account.description.length).toBeGreaterThan(15);
      expect(account.highlights.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('credentials match the provisioned accounts in scripts/demo-accounts.local.json', () => {
    const credsPath = path.join(process.cwd(), 'scripts', 'demo-accounts.local.json');
    if (fs.existsSync(credsPath)) {
      const raw = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      for (const role of expectedRoles) {
        const account = DEMO_ACCOUNTS_MAP[role];
        const localCred = raw.accounts[account.email];
        expect(localCred).toBeDefined();
        expect(account.password).toBe(localCred.password);
      }
    }
  });
});
