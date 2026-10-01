import * as vscode from 'vscode';

const translations: Record<string, Record<string, string>> = {
    'it': {
        // StatusBar
        'status.testFtp': 'Test FTP',
        'status.testFtp.tooltip': 'Test Connessione Universal FTP/SFTP',
        'status.uploadFtp': 'Upload FTP',
        'status.uploadFtp.tooltip': 'Carica i file del sito sul Server FTP/SFTP',
        'status.settings': 'Impostazioni FTP',
        'status.settings.tooltip': 'Apri le impostazioni di FTP Deploy',

        // TreeView
        'tree.url': '🌐 Anteprima URL',
        'tree.url.tooltip': 'Clicca per aprire nel browser',
        'tree.dest': '☁️ Cartella di Destinazione',
        'tree.dest.tooltip': 'Percorso finale in cui i file verranno caricati',
        'tree.buildFolder': '📁 File pronti per l\'upload',
        'tree.selectLocal': '📁 Seleziona Cartella Locale',
        'tree.selectLocal.tooltip': 'Clicca per scegliere la cartella da caricare',
        'tree.selectRemote': '☁️ Seleziona Cartella Remota FTP',
        'tree.selectRemote.tooltip': 'Clicca per navigare nel server FTP',
        'tree.verifySync': '🔄 Verifica Sincronizzazione',
        'tree.verifySync.tooltip': 'Controlla quali file sono nuovi o modificati sul server',
        'tree.noWorkspace': 'Nessun workspace aperto',
        'tree.noUrl': 'Nessun URL configurato',
        'tree.noBuildFolder': 'Nessuna cartella \'{0}\' trovata. Esegui la build.',
        'tree.excludedFolder.tooltip': 'Cartella esclusa dall\'upload',
        'tree.excludedFile.tooltip': 'File escluso dall\'upload',
        'tree.excluded.desc': '⛔ escluso dall\'upload',
        'tree.folder': 'Cartella',
        'tree.file': 'File',
        'tree.sync.desc': 'contiene file da sincronizzare',
        'tree.new': '(Nuovo)',
        'tree.modified': '(Modificato)',
        'tree.deleted': '(Da eliminare)',
        'tree.notSynced': 'non sincronizzato',

        // Messages - Errors
        'msg.err.noWorkspace': 'Nessun workspace aperto.',
        'msg.err.missingSettings': 'Host, username o password non configurati nelle impostazioni.',
        'msg.err.localFolderMissing': 'La cartella locale non esiste: {0}',
        'msg.err.prepFiles': 'Errore durante la preparazione dei file: {0}',
        'msg.err.remoteCheck': 'Errore durante il controllo remoto: {0}',
        'msg.err.ftpError': 'Errore FTP/SFTP: {0}',
        'msg.err.outOfWorkspace': 'La cartella deve essere all\'interno del workspace corrente.',
        'msg.err.connFailed': '❌ Connessione fallita: {0} {1}',
        'msg.err.readDir': 'Impossibile leggere la cartella {0}',

        // Messages - Warnings
        'msg.warn.noUrl': 'Nessun URL valido configurato nelle impostazioni.',
        'msg.warn.pluginDisabled': 'Il plugin Universal FTP Deploy è disabilitato nelle impostazioni.',
        'msg.warn.tlsFallback': 'Il test FTP è riuscito ma SOLO senza TLS. Disabilita "Secure FTP (FTPS)" nelle impostazioni per evitare problemi.',
        
        // Messages - Info
        'msg.info.reloaded': 'Impostazioni ricaricate ed applicate al progetto corrente.',
        'msg.info.localSet': 'Cartella locale impostata su: {0}',
        'msg.info.remoteSet': 'Cartella remota impostata su: {0}',
        'msg.info.excluded': '{0} elemento/i escluso/i dall\'upload.',
        'msg.info.included': '{0} elemento/i incluso/i nell\'upload.',
        'msg.info.syncCheck': 'Controllo completato: {0} file da sincronizzare.',
        'msg.info.syncCheckDelete': 'Controllo completato: {0} file da sincronizzare ({1} da eliminare).',
        'msg.info.testSuccess': '✅ Connessione e trasferimento dati verificati su {0}:{1} via {2}!',
        'msg.info.tlsDisabled': '✅ Secure FTP disabilitato. Il deploy userà FTP senza TLS.',
        'msg.info.isolated': '🌐 Universal FTP Deploy: Progetto isolato con successo in \'{0}\'. Le tue impostazioni FTP sono protette in locale.',
        'msg.info.alreadySynced': 'Tutti i file sono già sincronizzati con il server!',
        'msg.info.uploadSuccess': '✅ Upload FTP completato con successo per \'{0}\'!',
        'msg.info.exported': '✅ Impostazioni esportate con successo.',
        'msg.info.imported': '✅ Impostazioni importate con successo.',
        'msg.err.importFailed': '❌ Impossibile importare le impostazioni. File JSON non valido.',

        // Dialogs & Prompts
        'dialog.disableNow': 'Disabilita ora',
        'dialog.openPreview': 'Apri Anteprima',
        'dialog.yes': 'Sì',
        'dialog.no': 'No',
        'dialog.confirmUpload': 'Trovati {0} file da sincronizzare ({1} nuovi, {2} modificati). Procedere?',
        'dialog.confirmUploadDelete': 'Trovati {0} file da sincronizzare ({1} nuovi, {2} modificati, {3} da eliminare). Procedere?',

        // QuickPick
        'quickpick.chooseDir': '$(check) Scegli questa cartella: {0}',
        'quickpick.chooseDir.desc': 'Imposta come cartella remota per il deploy',
        'quickpick.parentDir': '$(folder) ..',
        'quickpick.parentDir.desc': 'Cartella Superiore',
        'quickpick.placeholder': 'Seleziona cartella in {0} (Attuale: {1})',

        // Progress
        'progress.checking': 'Controllo stato file su {0}...',
        'progress.testing': 'Test connessione {0} su {1}:{2}...',
        'progress.calculating': 'Calcolo differenze file con {0}...',
        'progress.uploading': 'Caricamento file su {0}...',
        'progress.connecting': 'Connessione a {0}...'
    },
    'en': {
        // StatusBar
        'status.testFtp': 'Test FTP',
        'status.testFtp.tooltip': 'Test Universal FTP/SFTP Connection',
        'status.uploadFtp': 'Upload FTP',
        'status.uploadFtp.tooltip': 'Upload website files to FTP/SFTP Server',
        'status.settings': 'FTP Settings',
        'status.settings.tooltip': 'Open FTP Deploy Settings',

        // TreeView
        'tree.url': '🌐 Preview URL',
        'tree.url.tooltip': 'Click to open in browser',
        'tree.dest': '☁️ Remote Target',
        'tree.dest.tooltip': 'Final remote path where files will be uploaded',
        'tree.buildFolder': '📁 Files ready for upload',
        'tree.selectLocal': '📁 Select Local Folder',
        'tree.selectLocal.tooltip': 'Click to select local build folder',
        'tree.selectRemote': '☁️ Select Remote FTP Folder',
        'tree.selectRemote.tooltip': 'Click to browse FTP server',
        'tree.verifySync': '🔄 Verify Sync Status',
        'tree.verifySync.tooltip': 'Check which files are new or modified on server',
        'tree.noWorkspace': 'No workspace open',
        'tree.noUrl': 'No URL configured',
        'tree.noBuildFolder': 'No \'{0}\' folder found. Run build first.',
        'tree.excludedFolder.tooltip': 'Folder excluded from upload',
        'tree.excludedFile.tooltip': 'File excluded from upload',
        'tree.excluded.desc': '⛔ excluded from upload',
        'tree.folder': 'Folder',
        'tree.file': 'File',
        'tree.sync.desc': 'contains files to sync',
        'tree.new': '(New)',
        'tree.modified': '(Modified)',
        'tree.deleted': '(To be deleted)',
        'tree.notSynced': 'not synced',

        // Messages - Errors
        'msg.err.noWorkspace': 'No open workspace.',
        'msg.err.missingSettings': 'Host, username or password are not configured.',
        'msg.err.localFolderMissing': 'Local folder does not exist: {0}',
        'msg.err.prepFiles': 'Error preparing files: {0}',
        'msg.err.remoteCheck': 'Error checking remote server: {0}',
        'msg.err.ftpError': 'FTP/SFTP Error: {0}',
        'msg.err.outOfWorkspace': 'The folder must be inside the current workspace.',
        'msg.err.connFailed': '❌ Connection failed: {0} {1}',
        'msg.err.readDir': 'Cannot read directory {0}',

        // Messages - Warnings
        'msg.warn.noUrl': 'No valid URL configured in settings.',
        'msg.warn.pluginDisabled': 'Universal FTP Deploy plugin is disabled in settings.',
        'msg.warn.tlsFallback': 'FTP test succeeded ONLY without TLS. Disable "Secure FTP (FTPS)" in settings to avoid issues.',

        // Messages - Info
        'msg.info.reloaded': 'Settings reloaded and applied to current project.',
        'msg.info.localSet': 'Local folder set to: {0}',
        'msg.info.remoteSet': 'Remote folder set to: {0}',
        'msg.info.excluded': '{0} item(s) excluded from upload.',
        'msg.info.included': '{0} item(s) included in upload.',
        'msg.info.syncCheck': 'Check complete: {0} files to sync.',
        'msg.info.syncCheckDelete': 'Check complete: {0} files to sync ({1} to delete).',
        'msg.info.testSuccess': '✅ Connection and data transfer verified on {0}:{1} via {2}!',
        'msg.info.tlsDisabled': '✅ Secure FTP disabled. Deploy will use FTP without TLS.',
        'msg.info.isolated': '🌐 Universal FTP Deploy: Project successfully isolated as \'{0}\'. Your FTP settings are protected locally.',
        'msg.info.alreadySynced': 'All files are already synchronized with the server!',
        'msg.info.uploadSuccess': '✅ FTP Upload successfully completed for \'{0}\'!',
        'msg.info.exported': '✅ Settings exported successfully.',
        'msg.info.imported': '✅ Settings imported successfully.',
        'msg.err.importFailed': '❌ Failed to import settings. Invalid JSON file.',

        // Dialogs & Prompts
        'dialog.disableNow': 'Disable now',
        'dialog.openPreview': 'Open Preview',
        'dialog.yes': 'Yes',
        'dialog.no': 'No',
        'dialog.confirmUpload': 'Found {0} files to sync ({1} new, {2} modified). Proceed?',
        'dialog.confirmUploadDelete': 'Found {0} files to sync ({1} new, {2} modified, {3} to delete). Proceed?',

        // QuickPick
        'quickpick.chooseDir': '$(check) Choose this folder: {0}',
        'quickpick.chooseDir.desc': 'Set as remote deploy folder',
        'quickpick.parentDir': '$(folder) ..',
        'quickpick.parentDir.desc': 'Parent Directory',
        'quickpick.placeholder': 'Select folder in {0} (Current: {1})',

        // Progress
        'progress.checking': 'Checking file status on {0}...',
        'progress.testing': 'Testing {0} connection to {1}:{2}...',
        'progress.calculating': 'Calculating file differences with {0}...',
        'progress.uploading': 'Uploading files to {0}...',
        'progress.connecting': 'Connecting to {0}...'
    }
};

export function t(key: string, ...args: (string | number)[]): string {
    const config = vscode.workspace.getConfiguration('ftpDeploy');
    const lang = config.get<string>('language') || 'en';
    
    const dict = translations[lang] || translations['en'];
    let text = dict[key] || translations['en'][key] || key; // Fallback to english, then key itself
    
    for (let i = 0; i < args.length; i++) {
        text = text.replace(`{${i}}`, String(args[i]));
    }
    return text;
}
