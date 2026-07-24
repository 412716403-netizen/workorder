/**
 * 单价输入：允许 0–1 之间小数（如 0.5）。
 * 用本地草稿避免受控 number + `value={n || ''}` / `parseFloat||0` 把 "0." 中间态吃掉。
 */
import React, { useState } from 'react';
import {
  commitUnitPriceInput,
  formatUnitPriceInputValue,
  isAllowedUnitPriceDraft,
  isUnitPriceDraftComplete,
} from '../utils/unitPriceInput';

export type UnitPriceInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'min' | 'step' | 'inputMode'
> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  /** 空输入提交时的回落值，默认 0 */
  emptyValue?: number;
};

export const UnitPriceInput = React.forwardRef<HTMLInputElement, UnitPriceInputProps>(
  function UnitPriceInput(
    { value, onValueChange, emptyValue = 0, onBlur, onFocus, className, placeholder = '0', ...rest },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const [draft, setDraft] = useState('');
    const display = focused ? draft : formatUnitPriceInputValue(value);

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        className={className}
        onFocus={e => {
          setFocused(true);
          // 0 / 空时从空白草稿开始，灰色 placeholder「0」在输入后自然消失
          setDraft(formatUnitPriceInputValue(value));
          onFocus?.(e);
        }}
        onChange={e => {
          const raw = e.target.value.replace(/,/g, '.');
          if (!isAllowedUnitPriceDraft(raw)) return;
          setDraft(raw);
          if (raw.trim() === '') {
            onValueChange(emptyValue);
            return;
          }
          if (!isUnitPriceDraftComplete(raw)) return;
          onValueChange(commitUnitPriceInput(raw, emptyValue));
        }}
        onBlur={e => {
          const next = commitUnitPriceInput(draft, emptyValue);
          onValueChange(next);
          setFocused(false);
          setDraft('');
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  },
);

export default UnitPriceInput;
