#!/usr/bin/env node
/**
 * 兼容旧脚本入口。
 *
 * 原实现会把所有主包不可达工具无差别迁入 packageBusiness，导致 packagePsi /
 * packageFinance 的跨分包引用断裂。现在统一委托给显式白名单、可校验的安全脚本。
 */
require('./optimize-main-package.cjs');
