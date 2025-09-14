# ferra-sdks

A monorepo containing SDKs for CLMM (Concentrated Liquidity Market Maker), DLMM (Discrete Liquidity Market Maker) protocols, and DEX Aggregator.

## Packages

- [`@ferra-xyz/clmm`](./packages/clmm) - Concentrated Liquidity Market Maker SDK
- [`@ferra-xyz/dlmm`](./packages/dlmm) - Discrete Liquidity Market Maker SDK
- [`@ferra-xyz/aggregator`](./packages/aggregator) - DEX Aggregator SDK

### Package Installation

```bash
# Install CLMM only
npm install @ferra-xyz/clmm

# Install DLMM only
npm install @ferra-xyz/dlmm

# Install Aggregator only
npm install @ferra-xyz/aggregator

# Install all packages
npm install @ferra-xyz/clmm @ferra-xyz/dlmm @ferra-xyz/aggregator
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
```# Build specific package
pnpm --filter @ferra.xyz/clmm build

# Run tests for specific package
pnpm --filter @ferra.xyz/dlmm test

# Start development mode for specific package
pnpm --filter @ferra.xyz/clmm dev
```

### Package Installation (After Publishing)

```bash
# Install CLMM only
npm install @ferra-xyz/clmm

# Install DLMM only
npm install @ferra-xyz/dlmm

# Install Aggregator only
npm install @ferra-xyz/aggregator

# Install specific combination
npm install @ferra-xyz/clmm @ferra-xyz/aggregator

# Install all packages
npm install @ferra-xyz/clmm @ferra-xyz/dlmm @ferra-xyz/aggregator
```

### Pre-release Testing

```bash
# Publish beta version
pnpm changeset pre enter beta
pnpm version-packages
pnpm release

# Install beta versions
npm install @ferra-xyz/clmm@beta
npm install @ferra-xyz/dlmm@beta
npm install @ferra-xyz/aggregator@beta

# Exit pre-release mode
pnpm changeset pre exit
```