import { createTsupConfig, commonExternals } from '../../shared/tsup.config.base'

export default createTsupConfig({
  entry: ['src/index.ts'],

  external: [
    ...commonExternals,
    // Add DLMM specific externals here
  ],

  banner: {
    js: '/* DLMM SDK - Discrete Liquidity Market Maker v1.0.0 */',
  },

  define: {
    __DLMM_VERSION__: '"1.0.0"',
    __PACKAGE_NAME__: '"@ferra-sdks/dlmm"',
  },

  // DLMM specific optimizations
  esbuildOptions(options: { conditions: string[] }) {
    options.conditions = ['module']
  },
})