/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hook centralizado para checagem de permissões por perfil.
 * Consome `useCollaboratorStore` como fonte do role atual.
 */

import { useMemo } from 'react';
import { useCollaboratorStore } from '../stores/collaboratorStore';
import {
  UserRole,
  TabId,
  ROLES,
  RoleDefinition,
  canAccessTab as canAccessTabFn,
} from '../config/rolePermissions';

export interface RoleAccessAPI {
  role: UserRole | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isUser: boolean;
  definition: RoleDefinition | null;
  canAccessTab: (tab: TabId) => boolean;
  canDelete: boolean;
  canConfigure: boolean;
  canViewGlobalMetrics: boolean;
}

export function useRoleAccess(): RoleAccessAPI {
  const { currentRole } = useCollaboratorStore();

  return useMemo<RoleAccessAPI>(() => {
    const role = (currentRole as UserRole | null) ?? null;

    if (!role || !ROLES[role]) {
      return {
        role: null,
        isAuthenticated: false,
        isAdmin: false,
        isUser: false,
        definition: null,
        canAccessTab: () => false,
        canDelete: false,
        canConfigure: false,
        canViewGlobalMetrics: false,
      };
    }

    const definition = ROLES[role];

    return {
      role,
      isAuthenticated: true,
      isAdmin: role === 'admin',
      isUser: role === 'user',
      definition,
      canAccessTab: (tab: TabId) => canAccessTabFn(role, tab),
      canDelete: definition.canDelete,
      canConfigure: definition.canConfigure,
      canViewGlobalMetrics: definition.canViewGlobalMetrics,
    };
  }, [currentRole]);
}
