# Development

## Environment

The isolated project was scaffolded with Vite's React + TypeScript template. The template expects Node.js 20.19+ or 22.12+; the setup environment provided Node.js v24.21.0 and npm v11.19.0. Dependencies are defined only in this project's `package.json` and lockfile.

The workspace parent is not a Git repository. A separate Git repository was initialized inside `fractal-studio`.

## Commands

Run from this directory:

```sh
npm install
npm run dev
npm run build
npm run lint
npm run test
```

## Troubleshooting

- On Windows PowerShell, the `npm.ps1` shim may be blocked by execution policy. Use `npm.cmd` for the same npm commands in that shell.
- WebGL2 support is required for rendering; no visual CPU fallback is implemented.
- Do not add dependencies without documenting why they are needed.

## Verification record

The declared npm dependencies installed successfully and npm reported zero known vulnerabilities. Build, lint, and deterministic math/navigation checks have passed. The built-in Node test runner uses Node's experimental TypeScript stripping flag to avoid an additional test dependency. Headless Edge with SwiftShader rendered the normal overview. The user's hardware GPU and other browsers still need validation.
