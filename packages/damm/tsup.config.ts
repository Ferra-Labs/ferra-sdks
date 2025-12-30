import { createTsupConfig, commonExternals } from '../../shared/tsup.config.base'

export default createTsupConfig({
  entry: ['src/index.ts'],

  external: [
    ...commonExternals,
    // Add DAMM specific externals here
  ],

  banner: {
    js: '/* DAMM SDK - Discrete Liquidity Market Maker v1.0.0 */',
  },

  define: {
    __DAMM_VERSION__: '"1.0.0"',
    __PACKAGE_NAME__: '"@ferra-sdks/damm"',
  },

  // DAMM specific optimizations
  esbuildOptions(options: { conditions: string[] }) {
    options.conditions = ['module']
  },
})