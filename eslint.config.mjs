import config from '@20minutes/eslint-config'
import globals from 'globals'

export default [
  ...config,
  {
    settings: {
      'import/core-modules': ['got', '@octokit/rest'],
      react: {
        version: '18.2',
      },
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: globals.vitest,
    },
  },
]
