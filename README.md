# lsp-prettier

A formatter-only Language Server that formats documents using Prettier.

## Install

### npm (as a CLI)
```bash
npm install -g lsp-prettier
# or
pnpm add -g lsp-prettier
# or
bun add -g lsp-prettier
```

### Scoop (Windows)
```powershell
scoop bucket add lsp-prettier https://github.com/watertank/lsp-prettier
scoop install lsp-prettier
```

## Usage

This server communicates over stdio. Start it with `--stdio`:

```bash
lsp-prettier --stdio
```

If you downloaded a GitHub Release binary, run the corresponding executable with `--stdio`, for example on Windows:

```powershell
lsp-prettier-windows-x64.exe --stdio
```
