# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for modern, predictable SemVer versioning and changelog management.

## Developer workflow

1. After implementing a change, create a changeset:

```bash
pnpm changeset
```

2. Select bump type (`patch`, `minor`, or `major`) and describe the change.

3. Commit the generated markdown file under `.changeset/` together with code changes.

## Release workflow

When maintainers are ready to release:

```bash
pnpm version-packages
pnpm release
```

`version-packages` updates versions/changelogs from pending changesets and `release` publishes the package.
