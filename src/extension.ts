import * as vscode from 'vscode';
import * as fs from 'fs';
import { buildSftpDiff, buildFtpDiff, uploadSftpList, uploadFtpList, DiffItem } from './syncLogic';
import SftpClient from 'ssh2-sftp-client';
import * as ftp from 'basic-ftp';
import * as path from 'path';


import { t } from './i18n';
import { browseRemoteFolder } from './remoteBrowser';
import { FtpDeployTreeProvider, DeployItem } from './treeView';

let statusBarItem: vscode.StatusBarItem;
let statusBarDeployItem: vscode.StatusBarItem;
let statusBarSettingsItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;



async function checkRemoteSync(treeDataProvider: FtpDeployTreeProvider) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    const workspaceRoot = folders[0].uri.fsPath;

    const config = vscode.workspace.getConfiguration('ftpDeploy');
    const enabled = config.get<boolean>('enabled') ?? true;
    if (!enabled) return;

    const autoDetect = config.get<boolean>('autoDetectBuildFolder') ?? true;
    const buildFolder = config.get<string>('localBuildFolder') || 'out';
    const protocol = config.get<string>('protocol') || 'sftp';
    const host = config.get<string>('host') || '';
    let port = Number(config.get<any>('port')) || 22;
    const username = config.get<string>('username') || '';
    const password = config.get<string>('password') || '';
    const secureFtp = config.get<boolean>('secureFtp') ?? true;
    let remoteFolder = config.get<string>('remoteFolder') || '';
    const useProjectName = config.get<boolean>('useProjectNameForRemoteFolder') ?? true;
    const customSubfolder = config.get<string>('customRemoteSubfolder') || '';

    if (useProjectName) {
        const projectName = (vscode.workspace.name || 'nuovo-progetto').replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        remoteFolder = appendProjectNameIfNeeded(remoteFolder, projectName);
    } else if (customSubfolder) {
        remoteFolder = appendProjectNameIfNeeded(remoteFolder, customSubfolder.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase());
    }

    if (protocol === 'ftp' && port === 22) port = 21;
    if (protocol === 'sftp' && port === 21) port = 22;

    if (!host || !username || !password) {
        vscode.window.showErrorMessage(t('msg.err.missingSettings'));
        return;
    }

    let detectedBuildFolder = buildFolder;
    if (autoDetect) {
        if (!fs.existsSync(path.join(workspaceRoot, buildFolder))) {
            const commonFolders = ['out', 'dist', 'build', 'public'];
            let found = false;
            for (const folder of commonFolders) {
                if (fs.existsSync(path.join(workspaceRoot, folder))) { detectedBuildFolder = folder; found = true; break; }
            }
            if (!found) detectedBuildFolder = fs.existsSync(path.join(workspaceRoot, 'out')) ? 'out' : '.';
        }
    }

    const localPath = path.resolve(workspaceRoot, detectedBuildFolder);
    if (!fs.existsSync(localPath)) return;

    let uploadPath = localPath;
    const tempDeployPath = path.join(workspaceRoot, '.temp_deploy');
    const excludedFiles = config.get<string[]>('excludedFiles') || [];

    if (detectedBuildFolder === '.' || excludedFiles.length > 0) {
        try {
            copyFolderSync(localPath, tempDeployPath, workspaceRoot, excludedFiles, detectedBuildFolder);
            uploadPath = tempDeployPath;
        } catch (e) {
            vscode.window.showErrorMessage(t('msg.err.prepFiles', ''));
            return;
        }
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: t('progress.checking', host),
        cancellable: true
    }, async (progress, token) => {
        try {
            let diff: DiffItem[] = [];
            if (protocol === 'sftp') {
                diff = await buildSftpDiff(host, port, username, password, uploadPath, remoteFolder, () => token.isCancellationRequested);
            } else {
                diff = await buildFtpDiff(host, port, username, password, uploadPath, remoteFolder, secureFtp, () => token.isCancellationRequested);
            }
            
            const syncMap = new Map<string, 'new' | 'modified'>();
            for (const item of diff) {
                const rel = path.relative(uploadPath, item.localPath);
                const originalLocalPath = path.join(localPath, rel);
                syncMap.set(originalLocalPath, item.type);
            }
            
            treeDataProvider.setRemoteSyncState(syncMap);
            vscode.window.showInformationMessage(t('msg.info.syncCheck', diff.length));
        } catch (err: any) {
            vscode.window.showErrorMessage(t('msg.err.remoteCheck', err.message));
        }
    });

    if (uploadPath === tempDeployPath && fs.existsSync(tempDeployPath)) {
        try { fs.rmSync(tempDeployPath, { recursive: true, force: true }); } catch (e) {}
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Tree View
    const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
        ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
    
    const treeDataProvider = new FtpDeployTreeProvider(rootPath, () => {
        return context.workspaceState.get<number>('lastDeployTime') || 0;
    }, () => {
        return vscode.workspace.getConfiguration('ftpDeploy').get<string[]>('excludedFiles') || [];
    });
    vscode.window.registerTreeDataProvider('ftpDeploy.deployView', treeDataProvider);
    
    // Watch per aggiornare in tempo reale l'albero dei file al salvataggio
    if (rootPath) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(rootPath, '**/*'));
        watcher.onDidChange(() => treeDataProvider.refresh());
        watcher.onDidCreate(() => treeDataProvider.refresh());
        watcher.onDidDelete(() => treeDataProvider.refresh());
        context.subscriptions.push(watcher);
    }
    
    // Inizializza Output Channel
    outputChannel = vscode.window.createOutputChannel("Universal FTP Deploy");
    context.subscriptions.push(outputChannel);
    
    // Auto configurazione del workspace
    autoConfigureWorkspaceIfNeeded(treeDataProvider).catch(console.error);

    const refreshCommand = vscode.commands.registerCommand('ftpDeploy.refreshView', () => {
        treeDataProvider.refresh();
    });

    const openUrlCommand = vscode.commands.registerCommand('ftpDeploy.openUrl', (url: string) => {
        if (!url || url.includes('Nessun URL')) {
            vscode.window.showWarningMessage(t('msg.warn.noUrl'));
            return;
        }
        vscode.env.openExternal(vscode.Uri.parse(url));
    });

    const reloadConfigCommand = vscode.commands.registerCommand('ftpDeploy.reloadConfiguration', async () => {
        await migrateGlobalSettingsToWorkspace();
        treeDataProvider.refresh();
        vscode.window.showInformationMessage(t('msg.info.reloaded'));
    });

    context.subscriptions.push(refreshCommand, openUrlCommand, reloadConfigCommand);

    const openSettingsCommand = vscode.commands.registerCommand('ftpDeploy.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', '@ext:5001.ftp-test-deploy');
    });

    const exportSettingsCommand = vscode.commands.registerCommand('ftpDeploy.exportSettings', async () => {
        const config = vscode.workspace.getConfiguration('ftpDeploy');
        const keys = ['host', 'port', 'protocol', 'username', 'password', 'secureFtp', 'remoteFolder', 'createRemoteFolder', 'useProjectNameForRemoteFolder', 'customRemoteSubfolder', 'autoDetectBuildFolder', 'localBuildFolder', 'excludedFiles', 'publicUrl'];
        const settings: any = {};
        for (const key of keys) {
            settings[key] = config.get(key);
        }
        const uri = await vscode.window.showSaveDialog({
            filters: { 'JSON': ['json'] },
            defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', 'ftp-deploy-settings.json'))
        });
        if (uri) {
            fs.writeFileSync(uri.fsPath, JSON.stringify(settings, null, 2), 'utf8');
            vscode.window.showInformationMessage(t('msg.info.exported'));
        }
    });

    const importSettingsCommand = vscode.commands.registerCommand('ftpDeploy.importSettings', async () => {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON': ['json'] }
        });
        if (uris && uris.length > 0) {
            try {
                const content = fs.readFileSync(uris[0].fsPath, 'utf8');
                const settings = JSON.parse(content);
                const config = vscode.workspace.getConfiguration('ftpDeploy');
                for (const key of Object.keys(settings)) {
                    await config.update(key, settings[key], vscode.ConfigurationTarget.Workspace);
                }
                vscode.window.showInformationMessage(t('msg.info.imported'));
                treeDataProvider.refresh();
            } catch (e) {
                vscode.window.showErrorMessage(t('msg.err.importFailed'));
            }
        }
    });

    context.subscriptions.push(openSettingsCommand, exportSettingsCommand, importSettingsCommand);

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('ftpDeploy')) {
            // Sincronizza automaticamente i valori globali nel workspace
            // così quando l'utente cambia una impostazione (es. password)
            // il nuovo valore viene propagato in tutti i workspace
            // Sincronizzazione automatica rimossa
            treeDataProvider.refresh();
        }
    }));

    // Registra il comando di test
    const disposable = vscode.commands.registerCommand('ftpDeploy.testConnection', async () => {
        await testConnection();
    });

    // Registra il comando di deploy
    const deployDisposable = vscode.commands.registerCommand('ftpDeploy.runDeploy', async () => {
        await runDeploy(context, treeDataProvider);
    });

    context.subscriptions.push(disposable, deployDisposable);

    const checkSyncDisposable = vscode.commands.registerCommand('ftpDeploy.checkRemoteSync', async () => {
        await checkRemoteSync(treeDataProvider);
    });
    context.subscriptions.push(checkSyncDisposable);

    const selectLocalFolderDisposable = vscode.commands.registerCommand('ftpDeploy.selectLocalFolder', async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage(t('msg.err.noWorkspace'));
            return;
        }
        const workspaceRoot = folders[0].uri.fsPath;
        
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: t('tree.selectLocal')
        });
        
        if (uris && uris.length > 0) {
            const selectedPath = uris[0].fsPath;
            let relativePath = path.relative(workspaceRoot, selectedPath);
            if (relativePath.startsWith('..')) {
                vscode.window.showErrorMessage(t('msg.err.outOfWorkspace'));
                return;
            }
            if (relativePath === '') {
                relativePath = '.';
            }
            
            const config = vscode.workspace.getConfiguration('ftpDeploy');
            await config.update('localBuildFolder', relativePath, vscode.ConfigurationTarget.Workspace);
            await config.update('autoDetectBuildFolder', false, vscode.ConfigurationTarget.Workspace);
            
            vscode.window.showInformationMessage(t('msg.info.localSet', relativePath));
        }
    });

    const selectRemoteFolderDisposable = vscode.commands.registerCommand('ftpDeploy.selectRemoteFolder', async () => {
        await browseRemoteFolder();
    });

    context.subscriptions.push(selectLocalFolderDisposable, selectRemoteFolderDisposable);



    // Registra i comandi di esclusione/inclusione file
    const excludeDisposable = vscode.commands.registerCommand('ftpDeploy.excludeFile', async (item: DeployItem, selectedItems?: DeployItem[]) => {
        const items = (selectedItems && selectedItems.length > 0) ? selectedItems : (item ? [item] : []);
        if (items.length === 0) { return; }

        const config = vscode.workspace.getConfiguration('ftpDeploy');
        const excluded = config.get<string[]>('excludedFiles') || [];
        const newExcluded = [...excluded];

        for (const i of items) {
            if (i.relativePath && !newExcluded.includes(i.relativePath)) {
                newExcluded.push(i.relativePath);
            }
        }

        await config.update('excludedFiles', newExcluded, vscode.ConfigurationTarget.Workspace);
        treeDataProvider.refresh();
        vscode.window.showInformationMessage(t('msg.info.excluded', items.length));
    });

    const includeDisposable = vscode.commands.registerCommand('ftpDeploy.includeFile', async (item: DeployItem, selectedItems?: DeployItem[]) => {
        const items = (selectedItems && selectedItems.length > 0) ? selectedItems : (item ? [item] : []);
        if (items.length === 0) { return; }

        const config = vscode.workspace.getConfiguration('ftpDeploy');
        const excluded = config.get<string[]>('excludedFiles') || [];
        const pathsToRemove = items.map(i => i.relativePath).filter(Boolean) as string[];
        const newExcluded = excluded.filter(e => !pathsToRemove.includes(e));

        await config.update('excludedFiles', newExcluded, vscode.ConfigurationTarget.Workspace);
        treeDataProvider.refresh();
        vscode.window.showInformationMessage(t('msg.info.included', items.length));
    });

    context.subscriptions.push(excludeDisposable, includeDisposable);

    // Crea bottone Deploy nella StatusBar (☁️ Upload FTP)
    statusBarDeployItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    statusBarDeployItem.command = 'ftpDeploy.runDeploy';
    statusBarDeployItem.text = `$(cloud-upload) ${t('status.uploadFtp')}`;
    statusBarDeployItem.tooltip = t('status.uploadFtp.tooltip');
    statusBarDeployItem.show();

    // Crea un bottone nella StatusBar (Test FTP)
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'ftpDeploy.testConnection';
    statusBarItem.text = `$(radio-tower) ${t('status.testFtp')}`;
    statusBarItem.tooltip = t('status.testFtp.tooltip');
    statusBarItem.show();

    statusBarSettingsItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    statusBarSettingsItem.command = 'ftpDeploy.openSettings';
    statusBarSettingsItem.text = `$(gear) ${t('status.settings')}`;
    statusBarSettingsItem.tooltip = t('status.settings.tooltip');
    statusBarSettingsItem.show();

    context.subscriptions.push(statusBarItem, statusBarDeployItem, statusBarSettingsItem);
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.hide();
        statusBarItem.dispose();
    }
    if (statusBarDeployItem) {
        statusBarDeployItem.hide();
        statusBarDeployItem.dispose();
    }
    if (statusBarSettingsItem) {
        statusBarSettingsItem.hide();
        statusBarSettingsItem.dispose();
    }
}

async function testConnection() {
    const config = vscode.workspace.getConfiguration('ftpDeploy');
    const protocol = config.get<string>('protocol') || 'sftp';
    const host = config.get<string>('host') || '';
    let portRaw = config.get<any>('port');
    let port = Number(portRaw) || 22;
    const username = config.get<string>('username') || '';
    const password = config.get<string>('password') || '';
    const secureFtp = config.get<boolean>('secureFtp') ?? true; // Defaults to true (FTPS)

    // Auto-correzione della porta se l'utente l'ha lasciata su default errati
    if (protocol === 'ftp' && port === 22) {
        port = 21;
    } else if (protocol === 'sftp' && port === 21) {
        port = 22;
    }

    if (!host || !username || !password) {
        vscode.window.showErrorMessage(t('msg.err.missingSettings'));
        return;
    }

    // Calcola la remote folder per il test di trasferimento
    let remoteFolder = config.get<string>('remoteFolder') || '/';
    const useProjectName = config.get<boolean>('useProjectNameForRemoteFolder') ?? true;
    const customSubfolder = config.get<string>('customRemoteSubfolder') || '';

    if (useProjectName) {
        const rawName = vscode.workspace.name || 'nuovo-progetto';
        const projectName = rawName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        remoteFolder = appendProjectNameIfNeeded(remoteFolder, projectName);
    } else if (customSubfolder) {
        const cleanSub = customSubfolder.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        remoteFolder = appendProjectNameIfNeeded(remoteFolder, cleanSub);
    }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: t('progress.testing', protocol.toUpperCase(), host, port),
        cancellable: false
    }, async (progress) => {
        try {
            if (protocol === 'sftp') {
                await testSftp(host, port, username, password, remoteFolder);
            } else {
                await testFtp(host, port, username, password, secureFtp, remoteFolder);
            }
            vscode.window.showInformationMessage(t('msg.info.testSuccess', host, port, protocol.toUpperCase()));
        } catch (err: any) {
            const errString = err.toString().toLowerCase();
            let extraMsg = '';
            
            // Check for potential IP block / Firewall
            if (errString.includes('timeout') || errString.includes('refused') || errString.includes('econnrefused')) {
                extraMsg = '\n\n⚠️ POSSIBILE BLOCCO IP: Assicurati di aver sbloccato il tuo IP pubblico dal pannello di controllo dell\'hosting.';
            } else if (errString.includes('tls') || errString.includes('cert')) {
                extraMsg = '\n\n⚠️ ERRORE TLS: Prova a disabilitare "Secure FTP (FTPS)" nelle impostazioni dell\'estensione.';
            } else if (errString.includes('protocol')) {
                extraMsg = '\n\n⚠️ ERRORE PROTOCOLLO: Assicurati che la porta e il protocollo siano corretti (es. non usare FTP sulla porta 22).';
            }
            
            vscode.window.showErrorMessage(t('msg.err.connFailed', err.message || err, extraMsg), { modal: true });
        }
    });
}

async function testSftp(host: string, port: number, user: string, pass: string, remoteFolder: string) {
    const sftp = new SftpClient();
    try {
        await sftp.connect({
            host: host,
            port: port,
            username: user,
            password: pass,
            readyTimeout: 10000 // fail fast if IP is blocked
        });
        // Test 1: Verifica canale dati con listing
        await sftp.list('.');

        // Test 2: Verifica trasferimento reale con file sonda
        const probeFileName = '.ftp-test-probe';
        const probeContent = Buffer.from(`FTP_PROBE_TEST_${Date.now()}`);
        const remoteProbePath = remoteFolder.endsWith('/') 
            ? remoteFolder + probeFileName 
            : remoteFolder + '/' + probeFileName;

        // Assicura che la cartella remota esista
        const remoteExists = await sftp.exists(remoteFolder);
        if (!remoteExists) {
            await sftp.mkdir(remoteFolder, true);
        }

        // Upload del file sonda
        await sftp.put(probeContent, remoteProbePath);

        // Verifica che il file esista sul server
        const probeExists = await sftp.exists(remoteProbePath);
        if (!probeExists) {
            throw new Error('Il file di test è stato caricato ma non risulta presente sul server. Il trasferimento potrebbe non funzionare correttamente.');
        }

        // Pulizia: elimina il file sonda
        await sftp.delete(remoteProbePath);
    } finally {
        await sftp.end();
    }
}

async function testFtp(host: string, port: number, user: string, pass: string, secure: boolean, remoteFolder: string) {
    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine(`[FTP Test] === Inizio test connessione FTP ===`);
    outputChannel.appendLine(`[FTP Test] Host: ${host}:${port} | Secure (FTPS): ${secure}`);
    outputChannel.appendLine(`[FTP Test] Utente: ${user}`);
    outputChannel.appendLine(`[FTP Test] Cartella remota: ${remoteFolder}`);
    outputChannel.appendLine('');

    // Tenta prima con la configurazione dell'utente, poi con fallback se secure fallisce
    const attempts: { secure: boolean; label: string }[] = [
        { secure, label: secure ? 'FTPS (TLS esplicito)' : 'FTP (senza TLS)' }
    ];
    // Se l'utente ha attivato secure, aggiungi un tentativo senza TLS come fallback
    if (secure) {
        attempts.push({ secure: false, label: 'FTP (senza TLS) — fallback' });
    }

    let lastError: any = null;
    for (const attempt of attempts) {
        const client = new ftp.Client(10000, { allowSeparateTransferHost: false });
        // Abilita verbose logging verso l'output channel
        client.ftp.verbose = true;
        client.ftp.log = (msg: string) => {
            outputChannel.appendLine(`  [FTP] ${msg}`);
        };

        try {
            outputChannel.appendLine(`[FTP Test] ▶ Tentativo: ${attempt.label}...`);
            await client.access({
                host: host,
                port: port,
                user: user,
                password: pass,
                secure: attempt.secure,
                secureOptions: { rejectUnauthorized: false }
            });
            outputChannel.appendLine(`[FTP Test] ✓ Login riuscito (${attempt.label})`);

            // Test 1: Verifica canale dati (PASV mode / listing)
            outputChannel.appendLine(`[FTP Test] ▶ Test canale dati (LIST)...`);
            await client.list();
            outputChannel.appendLine(`[FTP Test] ✓ Canale dati PASV funzionante`);

            // Test 2: Verifica trasferimento reale con file sonda
            const probeFileName = '.ftp-test-probe';
            const probeContent = `FTP_PROBE_TEST_${Date.now()}`;

            outputChannel.appendLine(`[FTP Test] ▶ Navigazione in ${remoteFolder}...`);
            await client.ensureDir(remoteFolder);
            outputChannel.appendLine(`[FTP Test] ✓ Cartella remota OK`);

            // Upload del file sonda tramite stream
            outputChannel.appendLine(`[FTP Test] ▶ Upload file di test (${probeFileName})...`);
            const { Readable } = require('stream');
            const probeStream = Readable.from([probeContent]);
            await client.uploadFrom(probeStream, probeFileName);
            outputChannel.appendLine(`[FTP Test] ✓ Upload riuscito`);

            // Verifica che il file esista nella lista
            outputChannel.appendLine(`[FTP Test] ▶ Verifica presenza file...`);
            const fileList = await client.list();
            const probeFound = fileList.some((f: any) => f.name === probeFileName);
            if (!probeFound) {
                throw new Error('Il file di test è stato caricato ma non risulta presente sul server. Il trasferimento potrebbe non funzionare correttamente.');
            }
            outputChannel.appendLine(`[FTP Test] ✓ File verificato sul server`);

            // Pulizia: elimina il file sonda
            outputChannel.appendLine(`[FTP Test] ▶ Pulizia file di test...`);
            await client.remove(probeFileName);
            outputChannel.appendLine(`[FTP Test] ✓ File di test rimosso`);
            outputChannel.appendLine('');
            outputChannel.appendLine(`[FTP Test] === TEST COMPLETATO CON SUCCESSO (${attempt.label}) ===`);

            // Se ha funzionato con il fallback, avvisa l'utente di cambiare le impostazioni
            if (attempt.label.includes('fallback')) {
                outputChannel.appendLine('');
                outputChannel.appendLine(`[FTP Test] ⚠️ NOTA: La connessione FTPS (con TLS) è fallita, ma ha funzionato senza TLS.`);
                outputChannel.appendLine(`[FTP Test] 💡 CONSIGLIO: Disabilita "Secure FTP (FTPS)" nelle impostazioni dell'estensione per evitare errori futuri.`);
                vscode.window.showWarningMessage(t('msg.warn.tlsFallback'), t('dialog.disableNow')).then(async (choice) => {
                    if (choice === 'Disabilita ora') {
                        const config = vscode.workspace.getConfiguration('ftpDeploy');
                        await config.update('secureFtp', false, vscode.ConfigurationTarget.Workspace);
                        vscode.window.showInformationMessage(t('msg.info.tlsDisabled'));
                    }
                });
            }

            return; // Test riuscito, esci
        } catch (err: any) {
            lastError = err;
            outputChannel.appendLine('');
            outputChannel.appendLine(`[FTP Test] ✗ FALLITO (${attempt.label}): ${err.message || err}`);
            if (err.code) {
                outputChannel.appendLine(`[FTP Test]   Codice errore: ${err.code}`);
            }
            outputChannel.appendLine('');
        } finally {
            client.close();
        }
    }

    // Se tutti i tentativi sono falliti, rilancia l'ultimo errore
    throw lastError;
}

async function autoConfigureWorkspaceIfNeeded(treeDataProvider: FtpDeployTreeProvider) {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return;
    }

    const config = vscode.workspace.getConfiguration('ftpDeploy');
    const enabled = config.get<boolean>('enabled') ?? true;
    
    if (!enabled) {
        return; 
    }

    const remoteFolderInspect = config.inspect<string>('remoteFolder');
    
    if (remoteFolderInspect?.workspaceValue === undefined) {
        // Pulisci il nome del progetto da eventuali spazi o caratteri strani
        const rawName = vscode.workspace.name || 'nuovo-progetto';
        const projectName = rawName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        
        const useProjectName = config.get<boolean>('useProjectNameForRemoteFolder') ?? true;
        const customSubfolder = config.get<string>('customRemoteSubfolder') || '';

        // Genera remoteFolder
        let baseRemote = remoteFolderInspect?.globalValue ?? remoteFolderInspect?.defaultValue ?? '/www.tuodominio.it/test-folder/';
        if (!baseRemote.endsWith('/')) {
            baseRemote += '/';
        }
        let newRemoteFolder = baseRemote;
        if (useProjectName) {
            newRemoteFolder = appendProjectNameIfNeeded(baseRemote, projectName);
        } else if (customSubfolder) {
            const cleanSub = customSubfolder.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
            newRemoteFolder = appendProjectNameIfNeeded(baseRemote, cleanSub);
        }

        const updates: Thenable<void>[] = [];
        updates.push(config.update('remoteFolder', newRemoteFolder, vscode.ConfigurationTarget.Workspace));

        // Genera publicUrl (solo se non è già configurato nel workspace)
        const publicUrlInspect = config.inspect<string>('publicUrl');
        if (publicUrlInspect?.workspaceValue === undefined) {
            let baseUrl = publicUrlInspect?.globalValue ?? publicUrlInspect?.defaultValue ?? 'https://www.tuodominio.it/test-folder/';
            if (!baseUrl.endsWith('/')) {
                baseUrl += '/';
            }
            let newPublicUrl = baseUrl;
            if (useProjectName) {
                newPublicUrl = appendProjectNameIfNeeded(baseUrl, projectName);
            } else if (customSubfolder) {
                const cleanSub = customSubfolder.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
                newPublicUrl = appendProjectNameIfNeeded(baseUrl, cleanSub);
            }
            updates.push(config.update('publicUrl', newPublicUrl, vscode.ConfigurationTarget.Workspace));
        }

        // Estrai tutti gli altri valori Globali/Default da clonare nel Workspace (escludendo localBuildFolder per evitare di bloccarlo a 'out')
        const keysToClone = ['host', 'port', 'protocol', 'username', 'password', 'secureFtp', 'createRemoteFolder', 'useProjectNameForRemoteFolder', 'customRemoteSubfolder'];

        // Clona le restanti impostazioni solo se non già presenti nel workspace
        for (const key of keysToClone) {
            const inspectObj = config.inspect<any>(key);
            if (inspectObj?.workspaceValue !== undefined) {
                // Mantiene il valore specifico del workspace configurato dall'utente
                continue;
            }
            const val = inspectObj?.globalValue !== undefined ? inspectObj.globalValue : inspectObj?.defaultValue;
            
            if (val !== undefined) {
                updates.push(config.update(key, val, vscode.ConfigurationTarget.Workspace));
            }
        }

        // Salva tutte le impostazioni del Workspace in parallelo (crea .vscode/settings.json)
        try {
            await Promise.all(updates);
            vscode.window.showInformationMessage(t('msg.info.isolated', projectName));
            // Aggiorna l'albero per mostrare il nuovo URL
            treeDataProvider.refresh();
        } catch (err) {
            console.error('Errore durante il salvataggio delle impostazioni di workspace:', err);
        }
    }
}


async function runDeploy(context: vscode.ExtensionContext, treeDataProvider: FtpDeployTreeProvider) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage(t('msg.err.noWorkspace'));
        return;
    }
    const workspaceRoot = folders[0].uri.fsPath;

    const config = vscode.workspace.getConfiguration('ftpDeploy');
    const enabled = config.get<boolean>('enabled') ?? true;
    if (!enabled) {
        vscode.window.showWarningMessage(t('msg.warn.pluginDisabled'));
        return;
    }

    const autoDetect = config.get<boolean>('autoDetectBuildFolder') ?? true;
    const buildFolder = config.get<string>('localBuildFolder') || 'out';
    const protocol = config.get<string>('protocol') || 'sftp';
    const host = config.get<string>('host') || '';
    let port = Number(config.get<any>('port')) || 22;
    const username = config.get<string>('username') || '';
    const password = config.get<string>('password') || '';
    const secureFtp = config.get<boolean>('secureFtp') ?? true;
    let remoteFolder = config.get<string>('remoteFolder') || '';
    const createRemoteFolder = config.get<boolean>('createRemoteFolder') ?? true;
    let publicUrl = config.get<string>('publicUrl') || '';
    const useProjectName = config.get<boolean>('useProjectNameForRemoteFolder') ?? true;
    const customSubfolder = config.get<string>('customRemoteSubfolder') || '';

    if (useProjectName) {
        const projectName = (vscode.workspace.name || 'nuovo-progetto').replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        remoteFolder = appendProjectNameIfNeeded(remoteFolder, projectName);
        publicUrl = appendProjectNameIfNeeded(publicUrl, projectName);
    } else if (customSubfolder) {
        const cleanSub = customSubfolder.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        remoteFolder = appendProjectNameIfNeeded(remoteFolder, cleanSub);
        publicUrl = appendProjectNameIfNeeded(publicUrl, cleanSub);
    }

    if (protocol === 'ftp' && port === 22) port = 21;
    if (protocol === 'sftp' && port === 21) port = 22;

    if (!host || !username || !password) {
        vscode.window.showErrorMessage(t('msg.err.missingSettings'));
        return;
    }

    let detectedBuildFolder = buildFolder;
    if (autoDetect) {
        if (!fs.existsSync(path.join(workspaceRoot, buildFolder))) {
            const commonFolders = ['out', 'dist', 'build', 'public'];
            let found = false;
            for (const folder of commonFolders) {
                if (fs.existsSync(path.join(workspaceRoot, folder))) {
                    detectedBuildFolder = folder;
                    found = true;
                    break;
                }
            }
            if (!found) {
                detectedBuildFolder = fs.existsSync(path.join(workspaceRoot, 'out')) ? 'out' : '.';
            }
        }
    }

    const localPath = path.resolve(workspaceRoot, detectedBuildFolder);
    if (!fs.existsSync(localPath)) {
        vscode.window.showErrorMessage(t('msg.err.localFolderMissing', localPath));
        return;
    }

    outputChannel.clear();
    outputChannel.show();
    outputChannel.appendLine(`[Deploy] Inizio caricamento per il progetto: ${vscode.workspace.name}`);
    outputChannel.appendLine(`[Deploy] Cartella locale: ${localPath}`);
    outputChannel.appendLine(`[Deploy] Server remoto: ${protocol.toUpperCase()}://${host}:${port}${remoteFolder}`);

    let uploadPath = localPath;
    let isStaging = false;
    const tempDeployPath = path.join(workspaceRoot, '.temp_deploy');
    const excludedFiles = config.get<string[]>('excludedFiles') || [];

    if (detectedBuildFolder === '.' || excludedFiles.length > 0) {
        outputChannel.appendLine('[Deploy] Preparazione cartella temporanea per escludere file impostati/di sistema...');
        isStaging = true;
        if (excludedFiles.length > 0) {
            outputChannel.appendLine(`[Deploy] File esclusi dall'upload: ${excludedFiles.join(', ')}`);
        }
        try {
            copyFolderSync(localPath, tempDeployPath, workspaceRoot, excludedFiles, detectedBuildFolder);
            uploadPath = tempDeployPath;
        } catch (copyErr: any) {
            outputChannel.appendLine(`[Deploy] ERRORE nella creazione dello staging: ${copyErr.message}`);
            vscode.window.showErrorMessage(t('msg.err.prepFiles', copyErr.message));
            return;
        }
    }

    let diff: DiffItem[] = [];
    const buildSuccess = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: t('progress.calculating', host),
        cancellable: true
    }, async (progress, token) => {
        try {
            if (protocol === 'sftp') {
                diff = await buildSftpDiff(host, port, username, password, uploadPath, remoteFolder, () => token.isCancellationRequested);
            } else {
                diff = await buildFtpDiff(host, port, username, password, uploadPath, remoteFolder, secureFtp, () => token.isCancellationRequested);
            }
            return true;
        } catch (err: any) {
            if (err.message !== 'Operazione annullata') {
                vscode.window.showErrorMessage(t('msg.err.ftpError', err.message));
            }
            return false;
        }
    });

    if (!buildSuccess) {
        if (isStaging && fs.existsSync(tempDeployPath)) {
            try { fs.rmSync(tempDeployPath, { recursive: true, force: true }); } catch (e) {}
        }
        return;
    }

    if (diff.length === 0) {
        vscode.window.showInformationMessage(t('msg.info.alreadySynced'));
        treeDataProvider.setRemoteSyncState(new Map());
        if (isStaging && fs.existsSync(tempDeployPath)) {
            try { fs.rmSync(tempDeployPath, { recursive: true, force: true }); } catch (e) {}
        }
        return;
    }

    const newFiles = diff.filter(d => d.type === 'new').length;
    const modifiedFiles = diff.filter(d => d.type === 'modified').length;

    const confirm = await vscode.window.showInformationMessage(
        t('dialog.confirmUpload', diff.length, newFiles, modifiedFiles),
        { modal: true },
        t('dialog.yes'), t('dialog.no')
    );

    if (confirm !== t('dialog.yes')) {
        if (isStaging && fs.existsSync(tempDeployPath)) {
            try { fs.rmSync(tempDeployPath, { recursive: true, force: true }); } catch (e) {}
        }
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: t('progress.uploading', host),
        cancellable: true
    }, async (progress, token) => {
        try {
            const onProgress = (msg: string) => progress.report({ message: msg });
            if (protocol === 'sftp') {
                await uploadSftpList(host, port, username, password, remoteFolder, createRemoteFolder, diff, onProgress, () => token.isCancellationRequested);
            } else {
                await uploadFtpList(host, port, username, password, remoteFolder, secureFtp, createRemoteFolder, diff, onProgress, () => token.isCancellationRequested);
            }
            outputChannel.appendLine(`[Deploy] ✅ Upload completato con successo!`);
            outputChannel.appendLine(`[Deploy] URL Anteprima: ${publicUrl}`);
            
            await context.workspaceState.update('lastDeployTime', Date.now());
            treeDataProvider.setRemoteSyncState(null);
            treeDataProvider.refresh();

            vscode.window.showInformationMessage(
                t('msg.info.uploadSuccess', vscode.workspace.name || ''), t('dialog.openPreview')).then(selection => {
                if (selection === t('dialog.openPreview')) {
                    vscode.env.openExternal(vscode.Uri.parse(publicUrl));
                }
            });
        } catch (err: any) {
            if (err.message !== 'Operazione annullata') {
                outputChannel.appendLine(`[Deploy] ERRORE CRITICO: ${err.message}`);
                vscode.window.showErrorMessage(t('msg.err.ftpError', err.message));
            } else {
                outputChannel.appendLine(`[Deploy] Operazione annullata dall'utente.`);
            }
        } finally {
            if (isStaging && fs.existsSync(tempDeployPath)) {
                try {
                    fs.rmSync(tempDeployPath, { recursive: true, force: true });
                } catch (rmErr) {}
            }
        }
    });
}

function copyFolderSync(from: string, to: string, workspaceRoot: string, excludedFiles: string[] = [], buildFolder: string = '.') {
    if (!fs.existsSync(to)) {
        fs.mkdirSync(to, { recursive: true });
    }
    const files = fs.readdirSync(from);
    const ignoredDirs = ['.git', 'node_modules', '.vscode', '.agents', '.temp_deploy'];
    const ignoredRootFiles = ['.gitignore', '.gitattributes', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'LICENSE'];

    for (const file of files) {
        if (ignoredDirs.includes(file)) {
            continue;
        }
        const fromPath = path.join(from, file);
        const toPath = path.join(to, file);

        // Controlla se questo file/cartella è nella lista di esclusione
        const relativePath = path.relative(workspaceRoot, fromPath);
        if (excludedFiles.includes(relativePath)) {
            continue;
        }

        const stat = fs.statSync(fromPath);
        if (stat.isDirectory()) {
            copyFolderSync(fromPath, toPath, workspaceRoot, excludedFiles, buildFolder);
        } else {
            if (buildFolder === '.' && from === workspaceRoot && ignoredRootFiles.includes(file)) {
                continue;
            }
            fs.copyFileSync(fromPath, toPath);
        }
    }
}

/**
 * Sincronizza i valori globali nel workspace corrente.
 * Quando l'utente cambia una impostazione a livello globale (User settings),
 * il nuovo valore viene propagato automaticamente nel workspace (.vscode/settings.json)
 * così che le impostazioni siano sempre aggiornate.
 * 
 * Le chiavi specifiche per progetto (remoteFolder, publicUrl, excludedFiles)
 * NON vengono sincronizzate per preservare la personalizzazione per workspace.
 */
async function syncGlobalSettingsToWorkspace(): Promise<void> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return;
    }

    const config = vscode.workspace.getConfiguration('ftpDeploy');

    // Chiavi che devono essere sincronizzate da globale → workspace
    // Escluse: remoteFolder, publicUrl, excludedFiles (sono specifiche per progetto)
    const keysToSync = [
        'enabled',
        'autoDetectBuildFolder',
        'localBuildFolder',
        'protocol',
        'secureFtp',
        'host',
        'port',
        'username',
        'password',
        'createRemoteFolder',
        'useProjectNameForRemoteFolder',
        'customRemoteSubfolder'
    ];

    const updates: Thenable<void>[] = [];
    for (const key of keysToSync) {
        const inspect = config.inspect<any>(key);
        if (!inspect) { continue; }

        // Se l'utente ha impostato un valore globale e questo è diverso
        // dal valore workspace, aggiorna il workspace
        if (inspect.globalValue !== undefined && inspect.workspaceValue !== inspect.globalValue) {
            updates.push(config.update(key, inspect.globalValue, vscode.ConfigurationTarget.Workspace));
        }
    }

    if (updates.length > 0) {
        try {
            await Promise.all(updates);
        } catch (err) {
            console.error('[FTP Deploy] Errore sincronizzazione impostazioni globali → workspace:', err);
        }
    }
}

async function migrateGlobalSettingsToWorkspace(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('ftpDeploy');
    const keys = [
        'enabled',
        'autoDetectBuildFolder',
        'localBuildFolder',
        'publicUrl',
        'protocol',
        'secureFtp',
        'host',
        'port',
        'username',
        'password',
        'remoteFolder',
        'createRemoteFolder',
        'useProjectNameForRemoteFolder',
        'customRemoteSubfolder'
    ];
    let migrated = false;
    for (const key of keys) {
        const inspect = config.inspect<any>(key);
        if (inspect && inspect.globalValue !== undefined) {
            await config.update(key, inspect.globalValue, vscode.ConfigurationTarget.Workspace);
            migrated = true;
        }
    }
    return migrated;
}

export function appendProjectNameIfNeeded(folder: string, projectName: string): string {
    if (!folder) return folder;
    let result = folder;
    if (!result.endsWith('/')) {
        result += '/';
    }
    const suffix = projectName + '/';
    if (result.endsWith(suffix)) {
        return result;
    }
    return result + suffix;
}

