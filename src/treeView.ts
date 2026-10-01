import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { appendProjectNameIfNeeded } from './extension';
import { t } from './i18n';

export class FtpDeployTreeProvider implements vscode.TreeDataProvider<DeployItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DeployItem | undefined | void> = new vscode.EventEmitter<DeployItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DeployItem | undefined | void> = this._onDidChangeTreeData.event;

    private remoteSyncState: Map<string, 'new' | 'modified' | 'deleted'> | null = null;

    constructor(
        private workspaceRoot: string | undefined,
        private getLastDeployTime: () => number,
        private getExcludedFiles: () => string[]
    ) {}

    setRemoteSyncState(state: Map<string, 'new' | 'modified' | 'deleted'> | null): void {
        this.remoteSyncState = state;
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DeployItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DeployItem): Thenable<DeployItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage(t('tree.noWorkspace'));
            return Promise.resolve([]);
        }

        if (!element) {
            // Root items: The Public URL and the Build Folder header
            const config = vscode.workspace.getConfiguration('ftpDeploy');
            let publicUrl = config.get<string>('publicUrl') || t('tree.noUrl');
            const useProjectName = config.get<boolean>('useProjectNameForRemoteFolder') ?? true;
            const customSubfolder = config.get<string>('customRemoteSubfolder') || '';
            if (useProjectName && publicUrl !== t('tree.noUrl')) {
                const rawName = vscode.workspace.name || 'nuovo-progetto';
                const projectName = rawName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
                publicUrl = appendProjectNameIfNeeded(publicUrl, projectName);
            } else if (!useProjectName && customSubfolder && publicUrl !== t('tree.noUrl')) {
                const cleanSub = customSubfolder.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
                publicUrl = appendProjectNameIfNeeded(publicUrl, cleanSub);
            }
            
            const urlItem = new DeployItem(
                t('tree.url'),
                vscode.TreeItemCollapsibleState.Expanded
            );
            urlItem.contextValue = 'urlItemGroup';

            const destItem = new DeployItem(
                t('tree.dest'),
                vscode.TreeItemCollapsibleState.Expanded
            );
            destItem.contextValue = 'destItemGroup';

            const buildFolderItem = new DeployItem(
                t('tree.buildFolder'),
                vscode.TreeItemCollapsibleState.Expanded
            );

            const localFolderItem = new DeployItem(
                t('tree.selectLocal'),
                vscode.TreeItemCollapsibleState.None,
                undefined,
                { command: 'ftpDeploy.selectLocalFolder', title: 'Seleziona Cartella Locale' }
            );
            localFolderItem.tooltip = t('tree.selectLocal.tooltip');

            const remoteFolderItem = new DeployItem(
                t('tree.selectRemote'),
                vscode.TreeItemCollapsibleState.None,
                undefined,
                { command: 'ftpDeploy.selectRemoteFolder', title: 'Seleziona Cartella Remota FTP' }
            );
            remoteFolderItem.tooltip = t('tree.selectRemote.tooltip');

            const syncCheckItem = new DeployItem(
                t('tree.verifySync'),
                vscode.TreeItemCollapsibleState.None,
                undefined,
                { command: 'ftpDeploy.checkRemoteSync', title: 'Verifica Stato Sincronizzazione' }
            );
            syncCheckItem.tooltip = t('tree.verifySync.tooltip');

            const exportItem = new DeployItem(
                "Export Settings",
                vscode.TreeItemCollapsibleState.None,
                undefined,
                { command: 'ftpDeploy.exportSettings', title: 'Export Settings' }
            );
            exportItem.iconPath = new vscode.ThemeIcon('save');

            const importItem = new DeployItem(
                "Import Settings",
                vscode.TreeItemCollapsibleState.None,
                undefined,
                { command: 'ftpDeploy.importSettings', title: 'Import Settings' }
            );
            importItem.iconPath = new vscode.ThemeIcon('cloud-download');

            return Promise.resolve([urlItem, destItem, localFolderItem, remoteFolderItem, syncCheckItem, exportItem, importItem, buildFolderItem]);
        } else if (element.label === t('tree.url')) {
            const config = vscode.workspace.getConfiguration('ftpDeploy');
            let publicUrl = config.get<string>('publicUrl') || t('tree.noUrl');
            const useProjectName = config.get<boolean>('useProjectNameForRemoteFolder') ?? true;
            const customSubfolder = config.get<string>('customRemoteSubfolder') || '';
            if (useProjectName && publicUrl !== t('tree.noUrl')) {
                const rawName = vscode.workspace.name || 'nuovo-progetto';
                const projectName = rawName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
                publicUrl = appendProjectNameIfNeeded(publicUrl, projectName);
            } else if (!useProjectName && customSubfolder && publicUrl !== t('tree.noUrl')) {
                const cleanSub = customSubfolder.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
                publicUrl = appendProjectNameIfNeeded(publicUrl, cleanSub);
            }
            const childItem = new DeployItem(publicUrl, vscode.TreeItemCollapsibleState.None, undefined, {
                command: 'ftpDeploy.openUrl',
                title: 'Apri URL',
                arguments: [publicUrl]
            });
            childItem.iconPath = new vscode.ThemeIcon('link-external');
            childItem.tooltip = publicUrl;
            return Promise.resolve([childItem]);
        } else if (element.label === t('tree.dest')) {
            const config = vscode.workspace.getConfiguration('ftpDeploy');
            const useProjectName = config.get<boolean>('useProjectNameForRemoteFolder') ?? true;
            const customSubfolder = config.get<string>('customRemoteSubfolder') || '';
            let remoteFolder = config.get<string>('remoteFolder') || '/';
            if (useProjectName && remoteFolder !== '/') {
                const rawName = vscode.workspace.name || 'nuovo-progetto';
                const projectName = rawName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
                remoteFolder = appendProjectNameIfNeeded(remoteFolder, projectName);
            } else if (!useProjectName && customSubfolder && remoteFolder !== '/') {
                const cleanSub = customSubfolder.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
                remoteFolder = appendProjectNameIfNeeded(remoteFolder, cleanSub);
            }
            const childItem = new DeployItem(remoteFolder, vscode.TreeItemCollapsibleState.None);
            childItem.iconPath = new vscode.ThemeIcon('folder-opened');
            childItem.tooltip = remoteFolder;
            return Promise.resolve([childItem]);
        } else if (element.label === t('tree.buildFolder')) {
            // Child items: the files inside the build folder
            const config = vscode.workspace.getConfiguration('ftpDeploy');
            const autoDetect = config.get<boolean>('autoDetectBuildFolder') ?? true;
            let buildFolder = config.get<string>('localBuildFolder') || 'out';

            if (autoDetect) {
                if (buildFolder && buildFolder !== 'out' && fs.existsSync(path.join(this.workspaceRoot, buildFolder))) {
                    // Utilizza la cartella personalizzata se configurata ed esistente
                } else {
                    const commonFolders = ['out', 'dist', 'build', 'public'];
                    let found = false;
                    for (const folder of commonFolders) {
                        if (fs.existsSync(path.join(this.workspaceRoot, folder))) {
                            buildFolder = folder;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        if (fs.existsSync(path.join(this.workspaceRoot, 'out'))) {
                            buildFolder = 'out';
                        } else {
                            buildFolder = '.';
                        }
                    }
                }
            }

            const buildFolderPath = path.join(this.workspaceRoot, buildFolder);

            if (!fs.existsSync(buildFolderPath)) {
                return Promise.resolve([
                    new DeployItem(t('tree.noBuildFolder', buildFolder), vscode.TreeItemCollapsibleState.None)
                ]);
            }

            return Promise.resolve(this.getFilesInFolder(buildFolderPath));
        } else if (element.relativePath) {
            // Subdirectory items
            const fullPath = path.join(this.workspaceRoot, element.relativePath);
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                return Promise.resolve(this.getFilesInFolder(fullPath));
            }
        }

        return Promise.resolve([]);
    }

    private getFilesInFolder(dirPath: string): DeployItem[] {
        const items: DeployItem[] = [];
        const files = fs.readdirSync(dirPath);

        const ignoredDirs = ['.git', 'node_modules', '.vscode', '.agents', '.temp_deploy'];
        const ignoredRootFiles = ['.gitignore', '.gitattributes', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'LICENSE'];

        const lastDeployTime = this.getLastDeployTime();
        const excludedFiles = this.getExcludedFiles();

        for (const file of files) {
            if (ignoredDirs.includes(file)) {
                continue;
            }
            if (dirPath === this.workspaceRoot && ignoredRootFiles.includes(file)) {
                continue;
            }

            const fullPath = path.join(dirPath, file);
            const stat = fs.statSync(fullPath);

            // Calcola il percorso relativo rispetto alla root del workspace
            const relativePath = this.workspaceRoot ? path.relative(this.workspaceRoot, fullPath) : file;
            const isExcluded = excludedFiles.includes(relativePath);

            if (stat.isDirectory()) {
                if (isExcluded) {
                    const item = new DeployItem(
                        `📂 ${file}`,
                        vscode.TreeItemCollapsibleState.None,
                        relativePath
                    );
                    item.contextValue = 'excludedItem';
                    item.tooltip = t('tree.excludedFolder.tooltip');
                    item.description = t('tree.excluded.desc');
                    items.push(item);
                } else {
                    const isModified = this.isDirModifiedRecursive(fullPath, lastDeployTime, excludedFiles);
                    let label = `📂 ${file}`;
                    if (isModified) {
                        label += ' ●';
                    }
                    const item = new DeployItem(
                        label,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        relativePath
                    );
                    item.contextValue = 'fileItem';
                    item.tooltip = t('tree.folder');
                    if (isModified) {
                        item.description = t('tree.sync.desc');
                    }
                    items.push(item);
                }
            } else {
                if (isExcluded) {
                    const item = new DeployItem(
                        `📄 ${file}`,
                        vscode.TreeItemCollapsibleState.None,
                        relativePath
                    );
                    item.contextValue = 'excludedItem';
                    item.tooltip = t('tree.excludedFile.tooltip');
                    item.description = t('tree.excluded.desc');
                    items.push(item);
                } else {
                    let isModified = false;
                    let desc = '';
                    if (this.remoteSyncState) {
                        if (this.remoteSyncState.has(fullPath)) {
                            isModified = true;
                            desc = this.remoteSyncState.get(fullPath) === 'new' ? t('tree.new') : t('tree.modified');
                        }
                    } else {
                        const fileMtime = stat.mtimeMs;
                        isModified = fileMtime > lastDeployTime;
                        if (isModified) desc = t('tree.notSynced');
                    }

                    const label = isModified ? `📄 ${file} ●` : `📄 ${file}`;
                    const item = new DeployItem(
                        label,
                        vscode.TreeItemCollapsibleState.None,
                        relativePath
                    );
                    item.contextValue = 'fileItem';
                    item.tooltip = t('tree.file');
                    if (isModified) {
                        item.description = desc;
                    }
                    items.push(item);
                }
            }
        }
        
        // Add deleted files that belong to this dirPath
        if (this.remoteSyncState) {
            for (const [remoteFilePath, state] of this.remoteSyncState.entries()) {
                if (state === 'deleted') {
                    // For deleted files, the key in the map is actually the remote path
                    // Let's just show them at the root level for simplicity, or we can parse the path.
                    // Wait, in extension.ts we stored item.remotePath as the key.
                    // If dirPath is the root buildFolder, we can show them there.
                    const isRootBuildFolder = this.workspaceRoot && (
                        dirPath === path.join(this.workspaceRoot, 'out') ||
                        dirPath === path.join(this.workspaceRoot, 'dist') ||
                        dirPath === path.join(this.workspaceRoot, 'build') ||
                        dirPath === path.join(this.workspaceRoot, 'public') ||
                        dirPath === this.workspaceRoot
                    );
                    
                    // A simple approximation: if we are at the root build folder, we show all deleted files here
                    // To be more precise, we could check if path.dirname(remoteFilePath) matches the relative dirPath.
                    // But since we just want to signal them, let's append them at the root.
                    const isRoot = path.relative(this.workspaceRoot || '', dirPath) === '.' || isRootBuildFolder;
                    if (isRoot) {
                        const item = new DeployItem(
                            `❌ ${path.basename(remoteFilePath)}`,
                            vscode.TreeItemCollapsibleState.None,
                            remoteFilePath
                        );
                        item.contextValue = 'deletedItem';
                        item.tooltip = t('tree.file');
                        item.description = t('tree.deleted');
                        items.push(item);
                    }
                }
            }
        }
        
        return items;
    }

    private isDirModifiedRecursive(dirPath: string, lastDeployTime: number, excludedFiles: string[]): boolean {
        try {
            const files = fs.readdirSync(dirPath);
            const ignoredDirs = ['.git', 'node_modules', '.vscode', '.agents', '.temp_deploy'];
            const ignoredRootFiles = ['.gitignore', '.gitattributes', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'LICENSE'];

            for (const file of files) {
                if (ignoredDirs.includes(file)) {
                    continue;
                }
                if (dirPath === this.workspaceRoot && ignoredRootFiles.includes(file)) {
                    continue;
                }

                const fullPath = path.join(dirPath, file);
                const relativePath = this.workspaceRoot ? path.relative(this.workspaceRoot, fullPath) : file;

                if (excludedFiles.includes(relativePath)) {
                    continue;
                }

                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    if (this.isDirModifiedRecursive(fullPath, lastDeployTime, excludedFiles)) {
                        return true;
                    }
                } else {
                    if (this.remoteSyncState) {
                        if (this.remoteSyncState.has(fullPath)) {
                            return true;
                        }
                    } else {
                        if (stat.mtimeMs > lastDeployTime) {
                            return true;
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Failed to read directory for modification status:', err);
        }
        return false;
    }
}

export class DeployItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly relativePath?: string,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
}
