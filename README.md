# Sync Studio

A real-time collaborative document editor built with TypeScript, React, WebSockets, and a custom sync engine.

Multiple clients can open the same document, edit it at the same time, and stay aligned as changes are shared across the app.

## Overview

Sync Studio is a lightweight collaborative editing system for shared documents. It models how text updates are merged, synchronized, and preserved when multiple clients are active at once.

It includes:

- a React frontend for editing
- a WebSocket server for real-time updates
- a document sync engine for merge and ordering logic
- MongoDB persistence for storing operations
- offline-safe behavior when a client reconnects

## What it does

Users can open the same document in multiple tabs or browser windows and continue editing without overwriting each other’s work.

The document state is updated locally first, then synced to the server and propagated to other connected clients.

This makes it a practical example of collaborative editing, sync behavior, and eventual consistency in a web app.

## Architecture

### Frontend
The client app provides the editing experience and handles local document updates.

### Sync engine
The engine in `packages/engine` manages document operations, ordering, inserts, deletes, and merge behavior.

### Server
The server accepts WebSocket connections, routes requests by document, and propagates updates between connected clients.

### Persistence
Operations are stored in MongoDB so the document can be reconstructed from historical changes after reconnects or restarts.

## Core features

- real-time document sync
- multi-client editing of a shared file
- local editing with eventual reconciliation
- offline and reconnect support
- server-side propagation of changes
- document state reconstruction from stored operations

## Project structure

```text
sync-engine/
├── apps/
│   ├── client/     # React editor client
│   └── server/     # WebSocket server and sync orchestration
├── packages/
│   └── engine/     # document sync engine and merge logic
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json
├── pnpm-lock.yaml
└── README.md
```

## Tech stack

- TypeScript
- React
- Vite
- Express
- WebSockets
- MongoDB
- Mongoose
- pnpm workspaces

## Getting started

### Prerequisites

- Node.js 18+
- pnpm
- MongoDB running locally or available remotely

### Install dependencies

```bash
pnpm install
```

### Start the server

```bash
cd apps/server
pnpm dev
```

### Start the client

```bash
cd apps/client
pnpm dev
```

### Try it locally

Open the app in multiple tabs or browser windows and edit the same document from different clients to see the sync behavior in action.

## Example workflow

1. Open the same document in two tabs.
2. Type in both tabs.
3. Watch the content stay aligned as new operations arrive.
4. Disconnect one tab temporarily.
5. Continue editing locally.
6. Reconnect and observe the changes merge back into the shared state.

## Future improvements

- richer editor support with cursor and selection syncing
- active user presence indicators
- document history and restore support
- better conflict visualization
- authentication and ownership rules
- scaling the sync system for larger collaborative documents

## License

This project is for learning and personal development.
