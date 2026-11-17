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

The test suite uses Vitest with Testing Library and jsdom for React UI behavior,
plus pure domain and mocked WebGL renderer tests. See
[`TEST_REPORT.md`](TEST_REPORT.md) for the latest run and its known failed cases.

## Troubleshooting

- On Windows PowerShell, the `npm.ps1` shim may be blocked by execution policy. Use `npm.cmd` for the same npm commands in that shell.
- WebGL2 support is required for rendering; no visual CPU fallback is implemented.
- Do not add dependencies without documenting why they are needed.

## Verification record

The current test run and failure details are recorded in
[`TEST_REPORT.md`](TEST_REPORT.md). UI tests mock WebGL and browser-only APIs;
they do not replace validation against the user's physical GPU and browser.
