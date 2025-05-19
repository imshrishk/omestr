// @ts-check

export default [
  {
    extends: [
      'next/core-web-vitals',
      'eslint:recommended',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'warn', // Downgrade to warning
      '@next/next/no-img-element': 'off',
    },
  }
];
