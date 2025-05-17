module.exports = {
  extends: [
    'next/core-web-vitals',
  ],
  rules: {
    // Disable some strict TypeScript rules for now
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'react-hooks/exhaustive-deps': 'off',
    '@typescript-eslint/ban-ts-comment': 'off'
  }
}; 