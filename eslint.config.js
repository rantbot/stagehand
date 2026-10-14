// The lint rules for Stagehand's JavaScript. Run them with `npm run lint`,
// which fetches ESLint the first time. Nothing here is needed to use Stagehand.

const browser = [
  'window',
  'document',
  'location',
  'navigator',
  'performance',
  'localStorage',
  'sessionStorage',
  'BroadcastChannel',
  'URL',
  'URLSearchParams',
  'Blob',
  'fetch',
  'crypto',
  'console',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'requestAnimationFrame',
  'addEventListener',
  'innerWidth',
  'innerHeight',
  'getComputedStyle',
  'parent',
  'prompt',
  'IntersectionObserver',
  'AudioContext',
];

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: Object.fromEntries(browser.map(name => [name, 'readonly'])),
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'error',
      'no-redeclare': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
];
