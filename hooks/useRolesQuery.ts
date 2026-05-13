import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type { RoleRow } from '../services/api';

const ROLES_QK = ['roles'] as const;

export function useRolesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ROLES_QK,
    queryFn: () => api.roles.list() as Promise<RoleRow[]>,
    enabled,
    staleTime: 30_000,
  });
}

export function useInvalidateRoles() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ROLES_QK });
}
