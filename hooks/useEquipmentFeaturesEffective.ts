import { useAuthOptional } from '../contexts/AuthContext';
import { equipmentFeaturesEffective } from '../utils/equipmentFeaturesEnabled';

/** 是否展示设备管理、工序设备派工与报工选设备（环境开关 ∧ 企业开关） */
export function useEquipmentFeaturesEffective(): boolean {
  const auth = useAuthOptional();
  return equipmentFeaturesEffective(auth?.tenantCtx?.equipmentFeaturesEnabled);
}
