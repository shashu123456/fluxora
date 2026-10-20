# AI Workspace — Quick Start

A production-quality, local-first AI desktop workspace. Everything runs on your
machine with no accounts and no cloud. Chat with AI models, manage provider
credentials, prompts, memories, workspaces, and usage — all stored locally in SQLite.

## Requirements

- **Node.js 18+** (includes npm). Download from [nodejs.org](https://nodejs.org)
- **Windows 10/11** (or macOS/Linux — scripts below focus on Windows)

---

## Installation

1. Install [Node.js](https://nodejs.org) if you don't have it.
2. Open a terminal in the project folder.
3. Install dependencies:

   ```
   npm install
   ```

4. Build the application:

   ```
   npm run build
   ```

---

## First Launch

1. Double-click **`launch-ai-workspace.bat`** (or run `npm run start`).
2. The window opens. The sidebar is on the left; the chat view is in the center.
3. Open **Settings** (gear icon) to add an AI provider and API key.
   - You can use an existing provider entry and fill in your own API key, or add a
     custom provider (OpenAI, Anthropic, OpenRouter, Ollama, etc.).
4. In a chat, pick your provider and model, type a message, and press **Send**.

Your data is stored in a local SQLite database under
`%APPDATA%\ai-workspace\data\aiworkspace.db` (unless portable mode changes the folder).

---

## How to Start the App

### Double-click (easiest)
Double-click **`launch-ai-workspace.bat`**. The launcher will:
- Install dependencies if they are missing.
- Build the app if no build exists.
- Launch Electron.
- Close the console window when you close the app.

> Tip: Create a desktop shortcut pointing to `launch-ai-workspace.bat` for one-click
> launching (see below).

### From the terminal

| Command            | What it does                                            |
| ------------------ | ------------------------------------------------------- |
| `npm run dev`      | Starts the Vite dev server only (renderer hot-reload).  |
| `npm run build`    | Type-checks and builds main + renderer into `dist/`.    |
| `npm run start`    | Launches the built Electron app (requires `npm run build` first). |
| `npm run electron:dev` | Runs the dev server **and** Electron together for development. |

---

## Creating a Desktop Shortcut (Windows)

1. Right-click `launch-ai-workspace.bat` and select **Create shortcut**.
2. Right-click the new shortcut and choose **Properties**.
3. Optional: on the **General** tab, rename the icon label to `AI Workspace`.
4. Click **Change Icon…** if you want a custom icon.
5. Click **OK**, then move or copy the shortcut to your Desktop (or Start Menu).

Double-click the shortcut to launch the app.

---

## Updating

1. Pull the latest code (or replace the project folder with the new version) —
   keeping `launch-ai-workspace.bat` in place.
2. Reinstall/refresh dependencies:

   ```
   npm install
   ```

3. Rebuild:

   ```
   npm run build
   ```

4. Relaunch with `launch-ai-workspace.bat` or `npm run start`.

Your chat history, providers, prompts, and settings live in the local database and
survive updates.

---

## Troubleshooting

### Double-clicking the launcher does nothing / window flashes
Run `launch-ai-workspace.bat` from a terminal to see the error output. Common causes:
- **Node.js not installed** — the launcher prints this; install Node.js.
- **Build is stale** — delete the `dist` and `dist-electron` folders, then run
  `npm run build`.

### `npm run start` says "electron: not found" or cannot find module
Dependencies are missing or stale. Run `npm install` again.

### Blank window on launch
This is usually a stale build after code changes. Rebuild:
```
npm run build
```
If it still fails, an error dialog explains the problem (the app catches startup
failures so you are never left with a silent blank window).

### Window opens but chat doesn't respond
Open **Settings** and make sure a provider is configured with a valid API key and
that a model is selected in the chat.

### Where is my data?
Local SQLite database: `%APPDATA%\ai-workspace\data\aiworkspace.db`.
Automatic backups are written to `%APPDATA%\ai-workspace\backups\` (see Settings).

### On-screen Electron warning about Content-Security-Policy
This is a development-mode warning only. It does not appear in the packaged app and
has no effect on functionality.

### Reset everything
In **Settings**, use **Reset** to clear all data, or delete the
`%APPDATA%\ai-workspace` folder manually (after closing the app).
