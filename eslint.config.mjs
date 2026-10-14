import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescriptConfig from 'eslint-config-next/typescript';

/**
 * One machine's home directory is not a path.
 *
 * `verify-mappers.mjs` and `verify-marketplace-search.mts` each hard coded
 * the absolute path of the container they were written in - as psql's `cwd`
 * and as the specifier of three dynamic imports. Everything passed, because
 * that directory existed on the machine doing the checking.
 *
 * It cost a red CI run the first time the workflow executed, and the failure
 * said `spawnSync psql ENOENT`: Node reports a working directory that does
 * not exist as ENOENT on the *binary*, so the error named a program that was
 * installed and working. The same trap waits for anyone who clones this
 * repository to a different path.
 *
 * `new URL('..', import.meta.url)` is the fix and it is shorter than what it
 * replaces. This is here so the next one is caught by `npm run lint` rather
 * than by a reviewer or by CI.
 */
const noAbsoluteHomePaths = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "Literal[value=/^\\/(home|Users|root)\\//]",
        message:
          "Absolute path into a home directory: this only works on the machine it was written on. Use new URL('..', import.meta.url) or a path relative to the repository root.",
      },
      {
        selector: "TemplateElement[value.raw=/^\\/(home|Users|root)\\//]",
        message:
          "Absolute path into a home directory: this only works on the machine it was written on. Use new URL('..', import.meta.url) or a path relative to the repository root.",
      },
    ],
  },
};

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...typescriptConfig,
  noAbsoluteHomePaths,
];

export default eslintConfig;
