# Copilot Instructions - iOS5team2 Mainboard Server

## Project Overview
This is an HLS (HTTP Live Streaming) video server built with Express and TypeScript, designed to handle video streaming operations using ffmpeg and ytdl-core. The server processes video content and serves it via HTTP.

## Architecture Pattern

### Class-Based Server Structure
- Server is implemented as `HlsServer` class in `src/server.ts`
- Class manages Express app instance, middleware setup, and routing
- Middleware is configured in `setupMiddleware()` before routes via `setupRoutes()`
- Server initialization happens through standalone `init()` function

### Feature-Based Module Organization
- Features organized in domain folders under `src/` (e.g., `src/video/`)
- Each feature module contains:
  - `*.route.ts` - Express router definitions
  - `*.service.ts` - Business logic layer (may be empty initially)

## TypeScript & Module Configuration

### ESM Module System
- Project uses ES Modules (`"type": "module"` in package.json)
- **Critical**: Import statements MUST include `.js` extension even for TypeScript files
  - ✅ `import videoRouter from './video/video.route.js'`
  - ❌ `import videoRouter from './video/video.route'`
- TypeScript compiles to `dist/` directory
- Module resolution: `"moduleResolution": "bundler"` with target `ES2022`

## Development Workflow

### Build & Run Commands
- `npm run start:dev` - Development mode with live reload (tsc-watch compiles on save, restarts server)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Production mode (builds first, then runs compiled code from dist/)
- Server runs on port 8080 by default

### Adding New Routes
1. Create feature folder under `src/` (e.g., `src/newfeature/`)
2. Add `newfeature.route.ts` with Express Router
3. Import router in `src/server.ts` with `.js` extension
4. Register in `setupRoutes()` method using `this.app.use('/path', router)`

## Key Dependencies & Use Cases

### Video Processing Stack
- `ytdl-core` - YouTube video downloading
- `fluent-ffmpeg` + `ffmpeg-static` - Video transcoding/processing for HLS
- Indicates server's purpose: convert video sources to HLS streaming format

### Middleware Stack Order
1. `morgan('dev')` - HTTP request logging
2. `cors()` - CORS enabled for all origins
3. Custom logging middleware (logs "this is a middleware log")
4. Routes registration via `setupRoutes()`
5. `express.json()` - JSON body parser (placed AFTER routes)

Note: JSON parser comes after routes, which is unconventional but intentional in this setup.

## File Path Conventions
- Source: `src/`
- Compiled output: `dist/`
- TypeScript paths map to `.js` imports
- Feature modules follow `src/[feature]/[feature].[type].ts` naming
