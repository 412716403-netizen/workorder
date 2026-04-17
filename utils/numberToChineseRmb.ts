/**
 * 人民币金额大写（票据常用字：壹贰叁…），支持到分；负数返回「负」前缀。
 */
const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const UNITS = ['', '拾', '佰', '仟'];
const BIG = ['', '万', '亿'];

function sectionToChinese(n: number): string {
  if (n === 0) return '';
  let s = '';
  let zero = false;
  for (let i = 0; i < 4; i++) {
    const d = n % 10;
    n = Math.floor(n / 10);
    if (d === 0) {
      zero = s.length > 0;
    } else {
      if (zero) {
        s = DIGITS[0] + s;
        zero = false;
      }
      s = DIGITS[d] + UNITS[i] + s;
    }
  }
  return s;
}

function integerToChinese(num: number): string {
  if (num === 0) return DIGITS[0];
  const parts: string[] = [];
  let i = 0;
  let n = num;
  while (n > 0 && i < BIG.length) {
    const sec = n % 10000;
    if (sec !== 0) {
      const inner = sectionToChinese(sec);
      parts.unshift(inner + BIG[i]);
    } else if (parts.length > 0 && !parts[0].startsWith(DIGITS[0])) {
      /* keep structure */
    }
    n = Math.floor(n / 10000);
    i++;
  }
  return parts.join('').replace(/零+/g, '零').replace(/零$/, '') || DIGITS[0];
}

export function amountToChineseRmbUppercase(amount: number): string {
  if (!Number.isFinite(amount)) return '零元整';
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const fen = Math.round(abs * 100);
  const yuan = Math.floor(fen / 100);
  const jiao = Math.floor((fen % 100) / 10);
  const f = fen % 10;
  let yPart = integerToChinese(yuan) + '元';
  if (jiao === 0 && f === 0) {
    yPart += '整';
  } else {
    if (jiao > 0) yPart += DIGITS[jiao] + '角';
    else if (f > 0) yPart += '零';
    if (f > 0) yPart += DIGITS[f] + '分';
  }
  return (neg ? '负' : '') + yPart;
}
