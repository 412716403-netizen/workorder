import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'backend/**', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 小程序 CommonJS 运行时：wx/Page/Component 等宿主全局 + 定时器/console
    files: ['miniprogram/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.commonjs,
        wx: 'readonly',
        App: 'readonly',
        Page: 'readonly',
        Component: 'readonly',
        Behavior: 'readonly',
        getApp: 'readonly',
        getCurrentPages: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // knowledgeHtmlForMini 等在测试（Node）环境下的回退分支
        Buffer: 'readonly',
        atob: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // 与 ts/tsx 基线一致：未使用变量按 warn 处理（含编译产物 _requireN 等）
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      // HTML 清洗工具刻意匹配控制字符
      'no-control-regex': 'off',
      'no-empty': 'warn',
    },
  },
  {
    // 仓库内 Node 脚本
    files: ['scripts/**/*.{js,mjs,cjs}', 'miniprogram/scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty': 'warn',
    },
  },
  {
    // 第三方 vendored 代码，保持与上游一致，不做本地整改
    files: ['utils/qrcodegenCore.js'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // 存量代码大量使用 any；关闭后 lint 可作 hooks/语法基线，后续再逐步收紧
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'react-hooks/exhaustive-deps': 'warn',
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
    },
  },
);
