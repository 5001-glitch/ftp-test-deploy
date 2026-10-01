# Universal FTP/SFTP Test Deploy

**Universal FTP/SFTP Test Deploy** is a specialized extension designed for both **Visual Studio Code** and **Google Antigravity IDE**. It modifies the standard local testing workflow by automatically deploying your project's build files to any remote server (via FTP or SFTP) before testing. 

Instead of relying on a local development server (`localhost`), this plugin ensures you test your application directly in its real-world hosting environment, improving reliability and catching environment-specific bugs early. It's fully compatible with any hosting provider that supports FTP or SSH/SFTP (e.g. Aruba, SiteGround, Hostinger, AWS, Serverplan, etc.).

## New Features (v1.3.20)
- **Remote File Deletion**: Added a new setting `ftpDeploy.deleteRemoteFiles` that allows the extension to automatically delete files on the remote server that no longer exist in your local project folder during synchronization.
- **Enhanced Sync Status & Dialogs**: The "Verify Sync Status" feature and upload dialogs now display the exact number of new, modified, and to-be-deleted files. Deleted files are also visually flagged with an `❌` icon in the Tree View.
- **Accurate Staging Timestamps**: Fixed a bug where deploying with excluded files would trigger a full re-upload of all files by accurately preserving local modification times during the staging phase.

## Previous Updates (v1.3.18)
- **Settings Layout & Order**: Restructured the Settings UI to preserve logical categories (Server Connection, Remote Paths, etc.) and ensure the proper display order. The Status Bar 'FTP Settings' button now correctly bypasses global search to maintain this strict categorization.
- **Settings Export/Import**: You can now export your FTP settings to a JSON file and import them into another project, making it easier to share configurations. Dedicated import and export icons have been added for these commands.
- **Status Bar Settings Button**: Added a convenient "FTP Settings" button in the status bar for quick access to the extension's configuration.
- **Improved UI for Long URLs**: The Remote Target and Preview URL in the side panel are now displayed clearly even when the paths are very long. Additionally, hovering over them with your mouse will reveal the full, untruncated URL in a tooltip.
- **Default Language**: The default language has been updated to English for broader compatibility.

## Previous Updates (v1.3.10)
- **Visual Folder Selection**: You can now use the "📁 Select Local Folder" and "☁️ Select Remote FTP Folder" buttons directly from the side panel to configure paths without typing text. The remote FTP browser allows you to navigate live through the server's folders!
- **Verify Sync Status**: Click "🔄 Verify Sync Status" in the side panel to compare the local folder with the remote one. The extension will display a dot (●) next to the files that need to be uploaded (because they are new or modified) and an (❌) next to deleted files.
- **Incremental Synchronization**: During deployment, only the newly created or modified files will be uploaded, and removed files can be automatically deleted on the server.
- **Multilingual Support & UI Improvements**: Added support for both English and Italian languages, adjustable via settings. Settings have been logically grouped for a better user experience.

## Features

### Core
- **Automated FTP/SFTP Deployment**: Automatically syncs your build folder (e.g., `out` or `dist`) to a remote server.
- **Static Site Support**: If no build folder is detected, the plugin uploads the project root directly, intelligently filtering out system files (`.git`, `node_modules`, `.vscode`, etc.).
- **IDE & Agent Integration**: Integrates seamlessly with Visual Studio Code and Google Antigravity IDE (and its AI agents), overriding default behaviors to prevent local testing and enforce remote validation when active.

### User Interface
- **One-Click Upload (☁️ Upload FTP)**: A prominent button in the VS Code StatusBar and an icon in the Explorer panel let you deploy your project with a single click.
- **Test Connection**: A `Test FTP` button in the StatusBar lets you instantly verify your credentials and network connection.
- **Preview URL**: The Explorer panel shows your public test URL. Click it to open the deployed site directly in your browser.
- **Progress & Notifications**: During upload, a native VS Code progress bar appears. On success, a popup offers a one-click "Open Preview" button to open the site.
- **Output Channel**: A dedicated "Universal FTP Deploy" output panel shows real-time logs of every connection, upload, and error.

### Sync Indicators
- **File Modification Tracking (●)**: Files modified since the last upload are marked with a `●` dot and the label *"not synced"*.
- **Recursive Folder Tracking**: If a folder contains any modified file (even nested), the folder itself shows the `●` dot with *"contains files to sync"*.
- **Remote Deletion Tracking (❌)**: Files deleted locally but still present on the server are marked with an `❌` icon in the Tree View and can be automatically deleted remotely.
- **Automatic Reset**: After a successful upload, all sync indicators disappear instantly, confirming your project is fully synchronized.
- **Real-Time Updates**: A built-in FileSystemWatcher detects file changes in real time, updating the indicators immediately when you save.

### File Exclusion
- **Exclude from Upload**: Right-click any file or folder in the Explorer panel → *"Exclude from Upload"* to prevent it from being uploaded.
- **Include Again**: Right-click an excluded item → *"Include in Upload"* to restore it.
- **Multi-Selection**: Select multiple items with `Cmd+Click` (Mac) or `Ctrl+Click` (Windows) and apply exclude/include to all at once.
- **Visual Indicator**: Excluded items show `⛔ excluded from upload` and are skipped during deployment.
- **Persistent**: The exclusion list is saved per-project in `.vscode/settings.json`.

### Configuration
- **Easy Configuration**: A built-in Settings UI to manage your host, port, credentials, and paths.
- **Auto-Detect Build Folder**: Smartly detects common build folders (`out`, `dist`, `build`, `public`).
- **Create Remote Folder**: Optionally auto-creates the destination folder on your FTP server if it doesn't exist.
- **Project Auto-Isolation**: Every time you open a project, the plugin automatically isolates its FTP settings into a local `.vscode/settings.json` file. This prevents projects from overwriting each other's remote folders. *(Warning: Ensure your `.vscode` folder is in `.gitignore` to avoid exposing FTP credentials to public repositories).*

## Usage & License

**This plugin is freely installable and free to use.** You are welcome to download, install, and utilize this tool in your personal or commercial projects without any charges.

## Credits & Copyright

- **Author**: 5001.tech
- **Copyright**: © 2026 5001.tech. All rights reserved.

*Developed with ❤️ to improve testing workflows.*
