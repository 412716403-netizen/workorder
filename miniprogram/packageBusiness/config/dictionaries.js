/** 公共数据字典 — 对齐 Web DictionariesTab */

const DICT_KIND_ALL = '__all__';
const DEFAULT_PAGE_SIZE = 20;

const DICT_KINDS = [
  { id: 'color', label: '颜色' },
  { id: 'size', label: '尺码' },
  { id: 'unit', label: '产品单位' },
];

const DICT_KIND_LABEL = {
  color: '颜色',
  size: '尺码',
  unit: '产品单位',
};

module.exports = {
  DICT_KIND_ALL,
  DEFAULT_PAGE_SIZE,
  DICT_KINDS,
  DICT_KIND_LABEL,
};
