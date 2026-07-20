import js from '@eslint/js'
import eslintConfigTypescript from '@vue/eslint-config-typescript'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'

export default [
  { ignores: ['dist/**', 'coverage/**', 'src/components.d.ts'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...eslintConfigTypescript(),
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': ['error', { singleline: 4, multiline: 1 }],
    },
  },
]
