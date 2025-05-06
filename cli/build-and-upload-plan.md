# Build and Upload Plan

## Overview
Create a dedicated script to build and upload Codebuff binaries, separating this functionality from the local deployment process.

## Components

### 1. New Script: `cli/build-and-upload.mjs`
```typescript
// Example structure
interface BuildConfig {
  version: string;
  platforms: Array<{plat: string, arch: string}>;
  uploadTarget: {
    type: 'github' | 's3';
    config: {
      // For GitHub: repo, token, etc.
      // For S3: bucket, region, etc.
    }
  }
}

async function buildBinaries(config: BuildConfig) {
  // Build Bun binary for each platform
}

async function createBundles(config: BuildConfig) {
  // Create .tar.gz or .zip files
}

async function uploadBundles(config: BuildConfig) {
  // Upload to specified target (GitHub/S3)
}
```

### 2. GitHub Actions Workflow
```yaml
name: Build and Upload Binaries

on:
  release:
    types: [created]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to build'
        required: true

jobs:
  build-and-upload:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        arch: [x64, arm64]
        exclude:
          - os: windows-latest
            arch: arm64
    steps:
      - uses: actions/checkout@v3
      - name: Build and Upload
        run: bun cli/build-and-upload.mjs
        env:
          VERSION: ${{ github.event.release.tag_name || inputs.version }}
          # Add necessary secrets/tokens
```

## Implementation Steps

1. **Extract Build Logic**
   - Move binary build logic from `deploy-local.mjs`
   - Add platform-specific build configurations
   - Add error handling and logging

2. **Add Upload Logic**
   - Implement GitHub Releases upload using Octokit
   - Add S3 upload option using AWS SDK
   - Add upload progress and verification

3. **Update Deployment Scripts**
   - Modify `deploy.mjs` to use uploaded binaries
   - Update `deploy-local.mjs` to optionally use local builds

4. **CI/CD Integration**
   - Create GitHub Actions workflow
   - Add necessary secrets
   - Test cross-platform builds

## Usage Examples

```bash
# Build and upload to GitHub Releases
bun cli/build-and-upload.mjs --version 1.0.0 --target github

# Build and upload to S3
bun cli/build-and-upload.mjs --version 1.0.0 --target s3 --bucket my-bucket

# Build locally only
bun cli/build-and-upload.mjs --version 1.0.0 --local-only
```

## Benefits

1. **Separation of Concerns**
   - Build/upload process is independent of deployment
   - Each script has a single responsibility

2. **Flexibility**
   - Multiple upload targets supported
   - Easy to add new platforms/architectures

3. **Automation**
   - CI/CD integration ready
   - Consistent build process across environments

4. **Maintainability**
   - Clear separation of build and deployment logic
   - Easier to debug and modify individual components