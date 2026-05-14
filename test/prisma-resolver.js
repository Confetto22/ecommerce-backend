/**
 * Custom Jest resolver for Prisma v7's ESM-style .js extensions.
 *
 * Prisma v7 generates client code that uses `./enums.js` and
 * `./internal/class.js` relative imports. Under ts-jest (CJS mode),
 * these fail because the actual files have `.ts` extensions.
 *
 * This resolver strips `.js` → `.ts` for any path inside `generated/prisma`.
 */
const path = require('path');

module.exports = (request, options) => {
  // Only remap .js imports that originate from generated/prisma
  if (
    request.endsWith('.js') &&
    options.basedir &&
    options.basedir.includes(path.join('generated', 'prisma'))
  ) {
    const tsRequest = request.replace(/\.js$/, '.ts');
    return options.defaultResolver(tsRequest, options);
  }

  return options.defaultResolver(request, options);
};
