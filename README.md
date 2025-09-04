# ferra-sdks


A monorepo containing SDKs for CLMM (Concentrated Liquidity Market Maker) and DLMM (Discrete Liquidity Market Maker) protocols.

## Packages

- [`@phoenix0x02/clmm`](./packages/clmm) - Concentrated Liquidity Market Maker SDK
- [`@phoenix0x02/dlmm`](./packages/dlmm) - Discrete Liquidity Market Maker SDK

### Package Installation

```
# Install CLMM only
npm install @phoenix0x02/clmm

# Install DLMM only
npm install @phoenix0x02/dlmm

# Install both
npm install @phoenix0x02/clmm @phoenix0x02/dlmm
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
```
git clone <repository-url>
cd ferra-sdks
pnpm install
pnpm prepare
```
### Available Scripts

- pnpm build - Build all packages
- pnpm dev - Start development mode with watch
- pnpm lint - Lint all packages
- pnpm test - Run tests for all packages
- pnpm clean - Clean build outputs
- pnpm changeset - Create a changeset for releases

### Package-Specific Commands
```# Build specific package
pnpm --filter @phoenix0x02/clmm build

# Run tests for specific package
pnpm --filter @phoenix0x02/dlmm test

# Start development mode for specific package
pnpm --filter @phoenix0x02/clmm dev
```

### Publishing
This project uses Changesets for version management and publishing.
```
# 1. Create changeset
pnpm changeset

# 2. Version packages
pnpm version-packages

# 3. Publish
pnpm release
```
### Contributing

1. Fork the repository
2. Create your feature branch (git checkout -b feature/amazing-feature)
3. Commit your changes (git commit -m 'feat: add amazing feature')
4. Push to the branch (git push origin feature/amazing-feature)
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
   ```
   mkdir ferra-sdks
   cd ferra-sdks
   git init
    ```
2. **Create the structure:**
    ```
    # Create directories
    mkdir -p packages/clmm/src packages/dlmm/src shared .husky/_ .changeset

    # Copy all the configuration files above
    ```

3. **Setup and install:**
    ```
    bashpnpm install
    pnpm prepare
    ```

4. **Start developing:**
    ```
    # Add your CLMM logic to packages/clmm/src/
    # Add your DLMM logic to packages/dlmm/src/
    ```

5. **Build and test:**
    ```
    pnpm build
    pnpm test
    ```

This setup provides a production-ready monorepo that allows users to install @phoenix0x02/clmm and @phoenix0x02/dlmm independently!


# NPM packages managerment
### Publishing Workflow
```
# Create changeset

pnpm changeset
```
### Version packages
```
pnpm version-packages
```
### Publish to npm
```
pnpm release
```
### Package Installation (After Publishing)

```
# Install CLMM only
npm install @phoenix0x02/clmm

# Install DLMM only
npm install @phoenix0x02/dlmm

# Install both
npm install @phoenix0x02/clmm @phoenix0x02/dlmm
```