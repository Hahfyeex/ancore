# Release Candidate (RC) Branch Policy

This document defines the branching and versioning strategy for Ancore release candidates.

## 1. Branching Strategy

Ancore follows a "Release Branch" model to isolate release preparation from ongoing development on `main`.

### `main` Branch
- The source of truth for all "stable" development.
- All feature branches and bug fixes target `main`.
- `main` should always be in a deployable state.

### `release/vX.Y.Z` Branches
- Created from `main` when a feature freeze is declared for a specific release.
- Naming convention: `release/vX.Y.Z` (e.g., `release/v1.0.0`).
- Used for final stabilization, documentation updates, and bug fixes for the release.
- **New features are NOT allowed** on release branches.

### Lifecycle of a Release Branch
1. **Creation**: Cut `release/vX.Y.Z` from `main`.
2. **Versioning**: Bump version to `X.Y.Z-rc.1` on the release branch.
3. **Stabilization**: Fix bugs found during RC testing on the release branch.
4. **RC Iteration**: Each set of fixes triggers a new RC tag (e.g., `vX.Y.Z-rc.2`).
5. **Backporting**: Bug fixes on the release branch MUST be merged back to `main`.
6. **Final Release**: Once stable, tag `vX.Y.Z` from the release branch.
7. **Cleanup**: Merge the release branch (or the final tag) back to `main` and delete the release branch.

---

## 2. Versioning Rules

### Semantic Versioning
Ancore adheres to [SemVer 2.0.0](https://semver.org/).
- `MAJOR.MINOR.PATCH`
- Pre-release versions use the `-rc.N` suffix.

### Version Consistency
- **Monorepo Rule**: The version in the root `package.json` is the authoritative version for the entire repository.
- All workspace packages (`apps/*`, `packages/*`, `services/*`) MUST have their `version` field synchronized with the root `package.json`.
- The Rust contract workspace (`contracts/Cargo.toml`) MUST also synchronize its version with the root version.

### Version Bumping
- **Feature/Minor**: Increment `MINOR` version (e.g., `0.1.0` -> `0.2.0`).
- **Fix/Patch**: Increment `PATCH` version (e.g., `0.1.0` -> `0.1.1`).
- **Breaking**: Increment `MAJOR` version (e.g., `0.1.0` -> `1.0.0`).

---

## 3. Rollback Protocol

If a release is found to be defective after tagging or deployment, the following protocol applies:

### 1. Immediate Revert (Git)
- If the tag was pushed but not yet "live", delete the tag and the release branch if necessary.
- If merged to `main`, revert the merge commit.

### 2. Rollback Deployment
- Use the `rollback-drill.yml` workflow or `scripts/release/rollback-drill.sh`.
- Follow the instructions in [docs/release/rollback-drill.md](file:///c:/Users/ADMIN/Desktop/lekan-drips/ancore/docs/release/rollback-drill.md).

### 3. Post-Mortem
- Every rollback requires a post-mortem to identify why the defect was not caught by the release gate.
- Update `docs/release/checklist.md` with new checks to prevent recurrence.
