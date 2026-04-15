import { describe, it, expect } from 'vitest';
import { parseRouteReportFileUrls, stringifyRouteReportFileUrls } from './routeReportFileUrls';

describe('routeReportFileUrls', () => {
  it('parseRouteReportFileUrls handles JSON array of data URLs', () => {
    const urls = ['data:image/png;base64,xx', 'data:application/pdf;base64,yy'];
    expect(parseRouteReportFileUrls(JSON.stringify(urls))).toEqual(urls);
  });

  it('parseRouteReportFileUrls handles single data URL', () => {
    const u = 'data:image/jpeg;base64,abc';
    expect(parseRouteReportFileUrls(u)).toEqual([u]);
  });

  it('stringifyRouteReportFileUrls round-trips', () => {
    const urls = ['data:image/png;base64,a'];
    expect(parseRouteReportFileUrls(stringifyRouteReportFileUrls(urls))).toEqual(urls);
    expect(stringifyRouteReportFileUrls([])).toBe('');
  });
});
