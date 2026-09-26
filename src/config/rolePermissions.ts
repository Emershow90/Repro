/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fonte única de verdade para perfis e permissões.
 */

export type UserRole = 'admin' | 'user';

export type TabId =
  | 'cronometro'
  | 'ruas'
  | 'artigos'
  | 'tv'
  | 'apoio'
  | 'gestao'
  | 'painel'
  | 'historico'
  | 'followup';

export interface RoleDefinition {
  id: UserRole;
  label: string;
  shortLabel: string;
  description: string;
  allowedTabs: TabId[];
  canEdit: boolean;
  canDelete: boolean;
  canConfigure: boolean;
  canViewGlobalMetrics: boolean;
}

export const ROLES: Record<UserRole, RoleDefinition> = {
  user: {
    id: 'user',
    label: 'Cliente Final',
    shortLabel: 'Operador',
    description: 'Acesso operacional: cronômetro, reabastecimento e consulta.',
    allowedTabs: ['cronometro', 'ruas', 'tv', 'historico', 'painel'],
    canEdit: true,
    canDelete: false,
    canConfigure: false,
    canViewGlobalMetrics: false,
  },
  admin: {
    id: 'admin',
    label: 'Administrador',
    shortLabel: 'Gestor',
    description: 'Acesso total: gestão, auditoria, integrações e relatórios.',
    allowedTabs: [
      'cronometro',
      'ruas',
      'artigos',
      'tv',
      'apoio',
      'gestao',
      'painel',
      'historico',
      'followup',
    ],
    canEdit: true,
    canDelete: true,
    canConfigure: true,
    canViewGlobalMetrics: true,
  },
};

export function canAccessTab(role: UserRole, tab: TabId): boolean {
  return ROLES[role].allowedTabs.includes(tab);
}

export function getRoleDefinition(role: UserRole): RoleDefinition {
  return ROLES[role];
}

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}
