module.exports = {
  root: true,
  extends: [
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // Customize rules based on project needs
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true 
    }],
    // Allow null assertions where necessary (only when you're certain)
    '@typescript-eslint/no-non-null-assertion': 'off',
    // Specify exact types instead of any
    '@typescript-eslint/no-explicit-any': 'error',
    // Enforce dependency arrays in React hooks
    'react-hooks/exhaustive-deps': 'warn',
  },
  // Ignore specific files that are causing issues but can't be fixed immediately
  overrides: [
    {
      files: ['src/app/dashboard/page.tsx'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      }
    },
    {
      files: ['src/app/api/chat/route.ts', 'src/app/login/page.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      }
    },
    {
      files: ['src/components/dashboard/FileUpload.tsx'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      }
    }
  ]
}
