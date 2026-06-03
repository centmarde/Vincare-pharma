import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'
import prettier from 'eslint-plugin-prettier'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  // Disable ESLint rules that conflict with Prettier
  eslintConfigPrettier,
  {
    files: ['**/*.js', '**/*.ts', '**/*.tsx', '**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        parser: {
          js: 'espree',
          ts: tsParser,
          '<template>': 'espree',
        },
        extraFileExtensions: ['.vue'],
      },
      globals: {
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        FileList: 'readonly',
      },
    },
    plugins: {
      vue: pluginVue,
      '@typescript-eslint': tseslint,
  prettier,
    },
    rules: {
      // Only essential rules - very lenient
      'no-debugger': 'error', // Only block debugger in production
      'no-var': 'error', // Enforce let/const over var
      'vue/no-parsing-error': 'error', // Block parsing errors

      // Everything else is warnings or off
      'no-console': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'prefer-const': 'off',
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
      'preserve-caught-error': 'off',

      // Vue rules - very minimal
      'vue/no-unused-vars': 'off',
      'vue/no-unused-components': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      'vue/require-prop-types': 'off',

      // TypeScript rules - very minimal
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Turn off all formatting
      'indent': 'off',
      'quotes': 'off',
      'semi': 'off',
      'comma-dangle': 'off',
      'vue/html-indent': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/html-self-closing': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/attributes-order': 'off',

  // Prettier formatting as an ESLint rule (auto-fixable)
  'prettier/prettier': 'error',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.nuxt/**',
      '.output/**',
      'public/**',
      '*.d.ts',
      'auto-imports.d.ts',
      'components.d.ts',
      'typed-router.d.ts',
  'vite.config.*',
  'eslint.config.*',
    ],
  },
]
