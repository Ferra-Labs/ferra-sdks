import { createTsupConfig, commonExternals } from '../../shared/tsup.config.base'

export default createTsupConfig({
  entry: ['src/index.ts'],

  external: [
    ...commonExternals,
    // Add AGG specific externals here
  ],

  banner: {
    js: '/* AGG SDK - Dex Aggregator v0.0.1 */',
  },

  define: {
    __AGG_VERSION__: '"0.0.1"',
    __PACKAGE_NAME__: '"@ferra-sdks/aggregator"',
  },

  // AGG specific optimizations
  esbuildOptions(options: { conditions: string[] }) {
    options.conditions = ['module']
  },
})