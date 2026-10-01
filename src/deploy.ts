import * as fs from 'fs';
import * as path from 'path';
import SftpClient from 'ssh2-sftp-client';
import * as ftp from 'basic-ftp';
import { buildSftpDiff, buildFtpDiff, uploadSftpList, uploadFtpList } from './syncLogic';

async function getPublicIp(): Promise<string> {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        if (!response.ok) return 'Sconosciuto';
        const data = await response.json();
        return data.ip || 'Sconosciuto';
    } catch {
        return 'Sconosciuto';
    }
}

async function deploy() {
    const workspaceRoot = process.cwd();
    const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
    
    // Default settings
    let enabled = true;
    let autoDetectBuildFolder = true;
    let localBuildFolder = 'out';
    let protocol = 'sftp'; // default to sftp
    let host = 'ftp.yourdomain.com';
    let port = 22; // default SFTP port
    let username = '';
    let password = '';
    let secureFtp = true; // Default to FTPS
    let remoteFolder = '/www.yourdomain.com/test-folder/';
    let createRemoteFolder = true;
    let publicUrl = 'https://www.yourdomain.com/test-folder/';
    let useProjectNameForRemoteFolder = true;
    let customRemoteSubfolder = '';
    const excludedFiles: string[] = [];

    console.log(`[Deploy] Cerco configurazioni in: ${settingsPath}`);

    if (fs.existsSync(settingsPath)) {
        try {
            const settingsRaw = fs.readFileSync(settingsPath, 'utf-8');
            const settings = JSON.parse(settingsRaw);

            enabled = settings['ftpDeploy.enabled'] ?? enabled;
            autoDetectBuildFolder = settings['ftpDeploy.autoDetectBuildFolder'] ?? autoDetectBuildFolder;
            protocol = settings['ftpDeploy.protocol'] ?? protocol;
            host = settings['ftpDeploy.host'] ?? host;
            port = settings['ftpDeploy.port'] ?? port;
            username = settings['ftpDeploy.username'] ?? username;
            password = settings['ftpDeploy.password'] ?? password;
            secureFtp = settings['ftpDeploy.secureFtp'] ?? secureFtp;
            remoteFolder = settings['ftpDeploy.remoteFolder'] ?? remoteFolder;
            createRemoteFolder = settings['ftpDeploy.createRemoteFolder'] ?? createRemoteFolder;
            publicUrl = settings['ftpDeploy.publicUrl'] ?? publicUrl;
            localBuildFolder = settings['ftpDeploy.localBuildFolder'] ?? localBuildFolder;
            useProjectNameForRemoteFolder = settings['ftpDeploy.useProjectNameForRemoteFolder'] ?? useProjectNameForRemoteFolder;
            customRemoteSubfolder = settings['ftpDeploy.customRemoteSubfolder'] ?? customRemoteSubfolder;
            if (Array.isArray(settings['ftpDeploy.excludedFiles'])) {
                excludedFiles.push(...settings['ftpDeploy.excludedFiles']);
            }

            console.log('[Deploy] Configurazioni IDE caricate con successo.');
        } catch (err) {
            console.error('[Deploy] Errore nel parsing di .vscode/settings.json:', err);
        }
    } else {
        console.warn('[Deploy] Nessun file .vscode/settings.json trovato, uso i valori di default o le variabili di ambiente.');
    }

    // Allow override via ENV variables
    protocol = process.env.FTP_PROTOCOL || protocol;
    host = process.env.FTP_HOST || host;
    let portRaw = process.env.FTP_PORT ? process.env.FTP_PORT : port;
    port = Number(portRaw) || 22;
    username = process.env.FTP_USERNAME || username;
    password = process.env.FTP_PASSWORD || password;
    secureFtp = process.env.FTP_SECURE ? process.env.FTP_SECURE === 'true' : secureFtp;
    remoteFolder = process.env.FTP_REMOTE_FOLDER || remoteFolder;
    createRemoteFolder = process.env.FTP_CREATE_REMOTE_FOLDER ? process.env.FTP_CREATE_REMOTE_FOLDER === 'true' : createRemoteFolder;
    publicUrl = process.env.FTP_PUBLIC_URL || publicUrl;
    localBuildFolder = process.env.FTP_LOCAL_BUILD_FOLDER || localBuildFolder;
    useProjectNameForRemoteFolder = process.env.FTP_USE_PROJECT_NAME ? process.env.FTP_USE_PROJECT_NAME === 'true' : useProjectNameForRemoteFolder;
    customRemoteSubfolder = process.env.FTP_CUSTOM_SUBFOLDER || customRemoteSubfolder;

    if (useProjectNameForRemoteFolder) {
        const rawName = path.basename(workspaceRoot);
        const projectName = rawName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        remoteFolder = appendProjectNameIfNeeded(remoteFolder, projectName);
        publicUrl = appendProjectNameIfNeeded(publicUrl, projectName);
    } else if (customRemoteSubfolder) {
        const cleanSub = customRemoteSubfolder.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        remoteFolder = appendProjectNameIfNeeded(remoteFolder, cleanSub);
        publicUrl = appendProjectNameIfNeeded(publicUrl, cleanSub);
    }

    // Auto-correzione della porta se l'utente l'ha lasciata su default errati
    if (protocol === 'ftp' && port === 22) {
        port = 21;
    } else if (protocol === 'sftp' && port === 21) {
        port = 22;
    }

    if (!enabled) {
        console.log('[Deploy] Il plugin Universal FTP/SFTP Test Deploy è DISABILITATO nelle impostazioni (ftpDeploy.enabled = false).');
        console.log('[Deploy] Il workflow di test procederà in locale come da standard.');
        process.exit(0);
    }

    if (!username || !password) {
        console.error('[Deploy] ERRORE: Username o password non configurati. Impostali nelle impostazioni IDE o come variabili d\'ambiente (FTP_USERNAME, FTP_PASSWORD).');
        process.exit(1);
    }

    let detectedBuildFolder = localBuildFolder;

    // Automatic folder detection
    if (autoDetectBuildFolder) {
        if (localBuildFolder && localBuildFolder !== 'out' && fs.existsSync(path.join(workspaceRoot, localBuildFolder))) {
            detectedBuildFolder = localBuildFolder;
        } else {
            const commonFolders = ['out', 'dist', 'build', 'public'];
            let found = false;
            for (const folder of commonFolders) {
                if (fs.existsSync(path.join(workspaceRoot, folder))) {
                    detectedBuildFolder = folder;
                    console.log(`[Deploy] Cartella di build rilevata automaticamente: ${folder}`);
                    found = true;
                    break;
                }
            }
            if (!found) {
                if (fs.existsSync(path.join(workspaceRoot, 'out'))) {
                    detectedBuildFolder = 'out';
                } else {
                    detectedBuildFolder = '.';
                    console.log(`[Deploy] Nessuna cartella di build rilevata. Verrà utilizzata la root del progetto.`);
                }
            }
        }
    }

    const localPath = path.resolve(workspaceRoot, detectedBuildFolder);

    if (!fs.existsSync(localPath)) {
        console.error(`[Deploy] ERRORE: La cartella di build locale non esiste: ${localPath}`);
        console.error('[Deploy] Esegui prima il processo di build (es. "npm run build").');
        process.exit(1);
    }

    let uploadPath = localPath;
    let isStaging = false;
    const tempDeployPath = path.join(workspaceRoot, '.temp_deploy');

    if (detectedBuildFolder === '.' || excludedFiles.length > 0) {
        console.log('[Deploy] Generazione cartella temporanea per escludere file impostati/di sistema...');
        isStaging = true;
        try {
            copyFolderSync(localPath, tempDeployPath, workspaceRoot, excludedFiles, detectedBuildFolder);
            uploadPath = tempDeployPath;
        } catch (copyErr: any) {
            console.error('[Deploy] ERRORE durante la preparazione della cartella temporanea:', copyErr.message || copyErr);
            process.exit(1);
        }
    }

    try {
        if (protocol === 'sftp') {
            console.log(`[Deploy] Protocollo SFTP selezionato sulla porta ${port}.`);
            await deploySftp(host, port, username, password, uploadPath, remoteFolder, publicUrl, createRemoteFolder);
        } else {
            console.log(`[Deploy] Protocollo FTP selezionato sulla porta ${port} (Secure: ${secureFtp}).`);
            await deployFtp(host, port, username, password, uploadPath, remoteFolder, publicUrl, secureFtp, createRemoteFolder);
        }
    } catch (err: any) {
        console.error('[Deploy] ERRORE FATALE durante la connessione o il caricamento:', err.message || err);
        
        // Custom error message for generic IP lock
        const errString = err.toString().toLowerCase();
        if (errString.includes('timeout') || errString.includes('refused') || errString.includes('econnrefused')) {
            const currentIp = await getPublicIp();
            console.error('\n======================================================');
            console.error('⚠️ POSSIBILE BLOCCO IP (FIREWALL HOSTING) ⚠️');
            console.error(`Il tuo IP pubblico attuale è: ${currentIp}`);
            console.error('Se il deploy fallisce per Timeout o Connection Refused,');
            console.error('alcuni provider (come Aruba, SiteGround, ecc.) potrebbero');
            console.error('bloccare le connessioni FTP/SFTP da IP non autorizzati.');
            console.error('Assicurati di aver sbloccato l\'IP dal Pannello di Controllo.');
            console.error('======================================================\n');
        } else if (errString.includes('tls') || errString.includes('cert')) {
            console.error('\n⚠️ ERRORE TLS: Prova a disabilitare "Secure FTP (FTPS)" nelle impostazioni dell\'estensione.\n');
        } else if (errString.includes('protocol')) {
            console.error('\n⚠️ ERRORE PROTOCOLLO: Assicurati che la porta e il protocollo siano corretti (es. non usare FTP sulla porta 22).\n');
        }
        
        process.exit(1);
    } finally {
        if (isStaging && fs.existsSync(tempDeployPath)) {
            console.log('[Deploy] Pulizia cartella temporanea...');
            try {
                fs.rmSync(tempDeployPath, { recursive: true, force: true });
            } catch (rmErr) {
                console.error('[Deploy] Impossibile rimuovere la cartella temporanea:', rmErr);
            }
        }
    }
}


async function deploySftp(host: string, port: number, user: string, pass: string, localPath: string, remoteFolder: string, publicUrl: string, createFolder: boolean) {
    console.log(`[Deploy] Connessione al server SFTP: ${host}:${port}...`);
    console.log(`[Deploy] Controllo file da sincronizzare...`);
    
    const diff = await buildSftpDiff(host, port, user, pass, localPath, remoteFolder, false, () => false);
    
    if (diff.length === 0) {
        console.log(`[Deploy] Tutti i file sono già sincronizzati.`);
        return;
    }
    
    console.log(`[Deploy] Trovati ${diff.length} file da caricare.`);
    
    await uploadSftpList(host, port, user, pass, remoteFolder, createFolder, diff, (msg) => console.log(`[Deploy] ${msg}`), () => false);
    
    console.log(`[Deploy] Upload completato con successo! Trasferiti ${diff.length} file.`);
    console.log(`[Deploy] =======================================`);
    console.log(`[Deploy] TEST URL: ${publicUrl}`);
    console.log(`[Deploy] =======================================`);
}

async function deployFtp(host: string, port: number, user: string, pass: string, localPath: string, remoteFolder: string, publicUrl: string, secure: boolean, createFolder: boolean) {
    console.log(`[Deploy] Connessione al server FTP: ${host}:${port} (Secure: ${secure})...`);
    console.log(`[Deploy] Controllo file da sincronizzare...`);
    
    const diff = await buildFtpDiff(host, port, user, pass, localPath, remoteFolder, secure, false, () => false);
    
    if (diff.length === 0) {
        console.log(`[Deploy] Tutti i file sono già sincronizzati.`);
        return;
    }
    
    console.log(`[Deploy] Trovati ${diff.length} file da caricare.`);
    
    await uploadFtpList(host, port, user, pass, remoteFolder, secure, createFolder, diff, (msg) => console.log(`[Deploy] ${msg}`), () => false);
    
    console.log(`[Deploy] Upload completato con successo! Trasferiti ${diff.length} file.`);
    console.log(`[Deploy] =======================================`);
    console.log(`[Deploy] TEST URL: ${publicUrl}`);
    console.log(`[Deploy] =======================================`);
}

deploy().catch(err => {
    console.error(err);
    process.exit(1);
});

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

function appendProjectNameIfNeeded(folder: string, projectName: string): string {
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
