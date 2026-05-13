import { describe, expect, it } from 'vitest';
import { resolvePreferredOutsourceRouteId } from './outsourceCollabRoutePreference';

describe('resolvePreferredOutsourceRouteId', () => {
  it('returns empty when preferred missing', () => {
    expect(resolvePreferredOutsourceRouteId(null, ['a', 'b'])).toBe('');
    expect(resolvePreferredOutsourceRouteId('', ['a'])).toBe('');
  });

  it('returns preferred when in allow list', () => {
    expect(resolvePreferredOutsourceRouteId('route-1', ['route-1', 'route-2'])).toBe('route-1');
  });

  it('returns empty when preferred not allowed', () => {
    expect(resolvePreferredOutsourceRouteId('route-x', ['route-1'])).toBe('');
  });
});
