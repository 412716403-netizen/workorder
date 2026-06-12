import { useEffect, useState } from 'react';
import { products } from '../services/api';
import { receiveUnitWeightAverageMap } from '../utils/receiveUnitWeightAverage';

/** 拉取产品历史外协收货单件重量均值（规格×工序） */
export function useReceiveUnitWeightAverages(
  productId: string | undefined,
  enabled: boolean,
): Record<string, number> {
  const [map, setMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!enabled || !productId) {
      setMap({});
      return;
    }
    let cancelled = false;
    void products
      .receiveUnitWeightAverages(productId)
      .then(res => {
        if (!cancelled) setMap(receiveUnitWeightAverageMap(res.averages));
      })
      .catch(err => {
        console.warn('[receiveUnitWeightAverages]', err);
        if (!cancelled) setMap({});
      });
    return () => {
      cancelled = true;
    };
  }, [productId, enabled]);

  return map;
}
