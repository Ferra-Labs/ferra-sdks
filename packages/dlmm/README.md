<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a >
    <img src="https://assets.ferra.ag/logo/logo/icon/Icon1.png" alt="Logo" width="100" height="100">
  </a>

  <h3 align="center">Ferra SDKs</h3>
</div>

A monorepo containing SDKs for CLMM (Concentrated Liquidity Market Maker), DLMM (Discrete Liquidity Market Maker) protocols, and DEX Aggregator.

## Packages

- [`@ferra-labs/clmm`](./packages/clmm) - Concentrated Liquidity Market Maker SDK
- [`@ferra-labs/dlmm`](./packages/dlmm) - Discrete Liquidity Market Maker SDK
- [`@ferra-labs/aggregator`](./packages/aggregator) - DEX Aggregator SDK

### Package Installation

```bash
# Install CLMM only
npm install @ferra-labs/clmm

# Install DLMM only
npm install @ferra-labs/dlmm

# Install Aggregator only
npm install @ferra-labs/aggregator

# Install all packages
npm install @ferra-labs/clmm @ferra-labs/dlmm @ferra-labs/aggregator
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint
```

## Development

### Prerequisites

- Node.js >= 16
- pnpm >= 8

### Setup
```bash
git clone <repository-url>
cd ferra-sdks
pnpm install
pnpm prepare
```

### Available Scripts

- `pnpm build` - Build all packages
- `pnpm dev` - Start development mode with watch
- `pnpm lint` - Lint all packages
- `pnpm test` - Run tests for all packages
- `pnpm clean` - Clean build outputs
- `pnpm changeset` - Create a changeset for releases

### Package-Specific Commands
```bash
# Build specific package
pnpm --filter @ferra-labs/clmm build
pnpm --filter @ferra-labs/dlmm build
pnpm --filter @ferra-labs/aggregator build

# Run tests for specific package
pnpm --filter @ferra-labs/clmm test
pnpm --filter @ferra-labs/dlmm test
pnpm --filter @ferra-labs/aggregator test

# Start development mode for specific package
pnpm --filter @ferra-labs/clmm dev
pnpm --filter @ferra-labs/dlmm dev
pnpm --filter @ferra-labs/aggregator dev
```

### Publishing

This project uses Changesets for version management and publishing.

```bash
# 1. Create changeset
pnpm changeset

# 2. Version packages
pnpm version-packages

# 3. Publish
pnpm release
```

### Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🎯 Key Features of This Setup

### ✅ **Monorepo Benefits**
- **Shared configuration** across packages
- **Unified development workflow**
- **Cross-package dependency management**
- **Consistent tooling and standards**

### ✅ **Independent Publishing**
- Each package can be **installed separately**
- **Individual versioning** with changesets
- **Selective updates** for users
- **Modular architecture**

### ✅ **Developer Experience**
- **Fast builds** with tsup
- **Hot reloading** in development
- **Automated linting** and formatting
- **Git hooks** for quality control
- **TypeScript support** throughout

### ✅ **Production Ready**
- **Multiple output formats** (CJS + ESM)
- **TypeScript declarations**
- **Source maps** for debugging
- **Tree shaking** support
- **Minification** for production

### ✅ **Maintenance**
- **Automated releases** with changesets
- **Consistent code style** with prettier/eslint
- **Commit message standards** with commitlint
- **Pre-commit hooks** with husky

---

## 🔧 Next Steps

1. **Initialize the repository:**
   ```bash
   mkdir ferra-sdks
   cd ferra-sdks
   git init
   ```

2. **Create the structure:**
   ```bash
   # Create directories
   mkdir -p packages/clmm/src packages/dlmm/src packages/aggregator/src shared .husky/_ .changeset

   # Copy all the configuration files above
   ```

3. **Setup and install:**
   ```bash
   pnpm install
   pnpm prepare
   ```

4. **Start developing:**
   ```bash
   # Add your CLMM logic to packages/clmm/src/
   # Add your DLMM logic to packages/dlmm/src/
   # Add your Aggregator logic to packages/aggregator/src/
   ```

5. **Build and test:**
   ```bash
   pnpm build
   pnpm test
   ```

This setup provides a production-ready monorepo that allows users to install `@ferra-labs/clmm`, `@ferra-labs/dlmm`, and `@ferra-labs/aggregator` independently!

---

# NPM Packages Management

### Publishing Workflow

```bash
# Create changeset
pnpm changeset
```

### Version packages
```bash
pnpm version-packages
```

### Publish to npm
```bash
pnpm release
```

### Package Installation (After Publishing)

```bash
# Install CLMM only
npm install @ferra-labs/clmm

# Install DLMM only
npm install @ferra-labs/dlmm

# Install Aggregator only
npm install @ferra-labs/aggregator

# Install specific combination
npm install @ferra-labs/clmm @ferra-labs/aggregator

# Install all packages
npm install @ferra-labs/clmm @ferra-labs/dlmm @ferra-labs/aggregator
```

### Pre-release Testing

```bash
# Publish beta version
pnpm changeset pre enter beta
pnpm version-packages
pnpm release

# Install beta versions
npm install @ferra-labs/clmm@beta
npm install @ferra-labs/dlmm@beta
npm install @ferra-labs/aggregator@beta

# Exit pre-release mode
pnpm changeset pre exit
```