import { describe, it, expect } from 'vitest';
import {
  buildProductCodePoolRegex,
  escapeLikeLiteral,
  escapeRegexLiteral,
} from '../src/services/products.service.js';

/**
 * 产品编号取号号池的前缀转义。
 * 号池 SQL 为 `name LIKE $prefix ESCAPE '\' AND name ~ $regex`，两层转义口径必须一致：
 * LIKE 决定能否走 varchar_pattern_ops 索引，正则决定最终是否命中。
 */
describe('product code pool prefix escaping', () => {
  it('escapes LIKE wildcards（编号规则的 `_` 分隔符是常见前缀）', () => {
    expect(escapeLikeLiteral('KZ_')).toBe('KZ\\_');
    expect(escapeLikeLiteral('A%B')).toBe('A\\%B');
    expect(escapeLikeLiteral('A\\B')).toBe('A\\\\B');
  });

  it('leaves ordinary prefixes untouched', () => {
    expect(escapeLikeLiteral('SW-')).toBe('SW-');
    expect(escapeLikeLiteral('')).toBe('');
  });

  it('escapes regex metacharacters', () => {
    // `-` 在括号表达式外是普通字符，无需转义
    expect(escapeRegexLiteral('SW-')).toBe('SW-');
    expect(escapeRegexLiteral('A.B')).toBe('A\\.B');
    expect(escapeRegexLiteral('A+B(C)')).toBe('A\\+B\\(C\\)');
    expect(escapeRegexLiteral('A$')).toBe('A\\$');
  });

  it('`_` 在正则里是普通字符，只需 LIKE 侧转义', () => {
    expect(escapeRegexLiteral('KZ_')).toBe('KZ_');
  });
});

/**
 * 号池位数上限：品名可手工录入任意长数字串，正则不设上限会让 `CAST(... AS BIGINT)` 溢出（22003）
 * 或超出 JS 安全整数范围导致 `max + 1` 重号。这里用 JS 正则近似校验 PG 正则的位数边界。
 */
describe('product code pool digit cap', () => {
  const match = (prefix: string, name: string) =>
    new RegExp(buildProductCodePoolRegex(prefix)).test(name);

  it('接受不超过 15 位的流水号', () => {
    expect(match('SW-', 'SW-001')).toBe(true);
    expect(match('SW-', `SW-${'9'.repeat(15)}`)).toBe(true);
  });

  it('排除 16 位及以上（BIGINT 溢出 / 精度丢失来源）', () => {
    expect(match('SW-', `SW-${'9'.repeat(16)}`)).toBe(false);
    expect(match('SW-', `SW-${'9'.repeat(30)}`)).toBe(false);
  });

  it('上限内的最大值仍是 JS 安全整数（保证 max + 1 不重号）', () => {
    expect(Number.isSafeInteger(Number('9'.repeat(15)))).toBe(true);
  });

  it('仍要求前缀完全匹配且后缀纯数字', () => {
    expect(match('SW-', 'SW-01A')).toBe(false);
    expect(match('SW-', 'XSW-01')).toBe(false);
    expect(match('SW-', 'SW-')).toBe(false);
    // 前缀含正则元字符时不退化成通配
    expect(match('A.B', 'AxB01')).toBe(false);
    expect(match('A.B', 'A.B01')).toBe(true);
  });
});
