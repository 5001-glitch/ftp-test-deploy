import * as vscode from 'vscode';
import SftpClient from 'ssh2-sftp-client';
import * as ftp from 'basic-ftp';
import { t } from './i18n';

export async function browseRemoteFolder() {
    const config = vscode.workspace.getConfiguration('ftpDeploy');
    const protocol = config.get<string>('protocol') || 'sftp';
    const host = config.get<string>('host') || '';
    let port = Number(config.get<any>('port')) || 22;
    const username = config.get<string>('username') || '';
    const password = config.get<string>('password') || '';
    const secureFtp = config.get<boolean>('secureFtp') ?? true;
    let currentRemoteFolder = config.get<string>('remoteFolder') || '/';

    if (protocol === 'ftp' && port === 22) port = 21;
    if (protocol === 'sftp' && port === 21) port = 22;

    if (!host || !username || !password) {
        vscode.window.showErrorMessage(t('msg.err.missingSettings'));
        return;
    }

    let sftp: any = null;
    let ftpClient: any = null;

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: t('progress.connecting', host),
            cancellable: false
        }, async () => {
            if (protocol === 'sftp') {
                sftp = new SftpClient();
                await sftp.connect({ host, port, username, password, readyTimeout: 10000 });
            } else {
                ftpClient = new ftp.Client(10000, { allowSeparateTransferHost: false });
                await ftpClient.access({ host, port, user: username, password, secure: secureFtp, secureOptions: { rejectUnauthorized: false } });
            }
        });

        // Loop per il browser
        let selecting = true;
        while (selecting) {
            let items: vscode.QuickPickItem[] = [];
            items.push({ label: t('quickpick.chooseDir', currentRemoteFolder), description: t('quickpick.chooseDir.desc') });
            if (currentRemoteFolder !== '/' && currentRemoteFolder !== '') {
                items.push({ label: t('quickpick.parentDir'), description: t('quickpick.parentDir.desc') });
            }

            try {
                let directories: string[] = [];
                if (protocol === 'sftp' && sftp) {
                    const list = await sftp.list(currentRemoteFolder);
                    directories = list.filter((f: any) => f.type === 'd').map((f: any) => f.name);
                } else if (ftpClient) {
                    const list = await ftpClient.list(currentRemoteFolder);
                    directories = list.filter((f: any) => f.isDirectory).map((f: any) => f.name);
                }
                
                directories.sort();
                for (const dir of directories) {
                    if (dir !== '.' && dir !== '..') {
                        items.push({ label: `$(folder) ${dir}` });
                    }
                }
            } catch (err) {
                vscode.window.showErrorMessage(t('msg.err.readDir', currentRemoteFolder));
                // Torna alla root se fallisce
                if (currentRemoteFolder !== '/') {
                    currentRemoteFolder = '/';
                    continue;
                }
            }

            const selection = await vscode.window.showQuickPick(items, {
                placeHolder: t('quickpick.placeholder', host, currentRemoteFolder),
                ignoreFocusOut: true
            });

            if (!selection) {
                selecting = false;
                break;
            }

            if (selection.label === t('quickpick.chooseDir', currentRemoteFolder)) {
                // L'utente ha confermato
                await config.update('remoteFolder', currentRemoteFolder, vscode.ConfigurationTarget.Workspace);
                await config.update('useProjectNameForRemoteFolder', false, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(t('msg.info.remoteSet', currentRemoteFolder));
                selecting = false;
            } else if (selection.label === t('quickpick.parentDir')) {
                // Vai su di un livello
                const parts = currentRemoteFolder.split('/').filter(p => p.length > 0);
                parts.pop();
                currentRemoteFolder = '/' + parts.join('/');
                if (!currentRemoteFolder.endsWith('/')) {
                    currentRemoteFolder += '/';
                }
            } else {
                // Entra in una sottocartella
                const dirName = selection.label.replace('$(folder) ', '');
                if (!currentRemoteFolder.endsWith('/')) {
                    currentRemoteFolder += '/';
                }
                currentRemoteFolder += dirName + '/';
            }
        }

    } catch (err: any) {
        vscode.window.showErrorMessage(t('msg.err.connFailed', err.message, ''));
    } finally {
        if (sftp) {
            await sftp.end();
        }
        if (ftpClient) {
            ftpClient.close();
        }
    }
}
