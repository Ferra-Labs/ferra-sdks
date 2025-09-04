import { defineConfig, Options } from 'tsup'

export const createTsupConfig = (options: Partial<Options> = {}): Options => {
  return defineConfig({
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: 'es2020',
    minify: process.env.NODE_ENV === 'production',
    treeshake: true,
    keepNames: true,

    // Environment specific configs
    ...(process.env.NODE_ENV === 'development' && {
      watch: ['src'],
      onSuccess: 'echo "✅ Build succeeded"',
    }),

    // Merge custom options
    ...options,
  })
}

export const commonExternals = [
  // Add your common dependencies here
]