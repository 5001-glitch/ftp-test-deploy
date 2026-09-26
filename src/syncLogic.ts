import * as fs from 'fs';
import * as path from 'path';
import SftpClient from 'ssh2-sftp-client';
import * as ftp from 'basic-ftp';

export interface DiffItem {
    localPath: string;
    remotePath: string;
    type: 'new' | 'modified';
    name: string;
}

export async function buildSftpDiff(host: string, port: number, user: string, pass: string, localPath: string, remoteFolder: string, isCancelled: () => boolean = () => false): Promise<DiffItem[]> {
    const sftp = new SftpClient();
    try {
        await sftp.connect({ host, port, username: user, password: pass, readyTimeout: 10000 });
        if (isCancelled()) throw new Error('Operazione annullata');
        
        const diff: DiffItem[] = [];
        async function syncDir(currentLocalPath: string, currentRemotePath: string) {
            if (isCancelled()) throw new Error('Operazione annullata');
            const entries = fs.readdirSync(currentLocalPath, { withFileTypes: true });
            
            let remoteFiles: SftpClient.FileInfo[] = [];
            try { remoteFiles = await sftp.list(currentRemotePath); } catch (err) {}
            
            const remoteMap = new Map<string, SftpClient.FileInfo>();
            for (const file of remoteFiles) remoteMap.set(file.name, file);
            
            for (const entry of entries) {
                if (isCancelled()) throw new Error('Operazione annullata');
                const entryLocalPath = path.join(currentLocalPath, entry.name);
                const entryRemotePath = currentRemotePath.endsWith('/') ? currentRemotePath + entry.name : currentRemotePath + '/' + entry.name;
                
                if (entry.isDirectory()) {
                    await syncDir(entryLocalPath, entryRemotePath);
                } else {
                    const localStat = fs.statSync(entryLocalPath);
                    const remoteFile = remoteMap.get(entry.name);
                    
                    let shouldUpload = true;
                    let type: 'new'|'modified' = 'new';
                    if (remoteFile) {
                        type = 'modified';
                        if (remoteFile.size === localStat.size && remoteFile.modifyTime >= Math.floor(localStat.mtimeMs) - 2000) {
                            shouldUpload = false;
                        }
                    }
                    if (shouldUpload) {
                        diff.push({ localPath: entryLocalPath, remotePath: entryRemotePath, type, name: entry.name });
                    }
                }
            }
        }
        await syncDir(localPath, remoteFolder);
        return diff;
    } finally {
        await sftp.end();
    }
}

export async function uploadSftpList(host: string, port: number, user: string, pass: string, remoteFolder: string, createFolder: boolean, diff: DiffItem[], onProgress: (msg: string) => void, isCancelled: () => boolean = () => false) {
    if (diff.length === 0) return;
    const sftp = new SftpClient();
    try {
        await sftp.connect({ host, port, username: user, password: pass, readyTimeout: 10000 });
        if (isCancelled()) throw new Error('Operazione annullata');
        
        const remoteExists = await sftp.exists(remoteFolder);
        if (!remoteExists) {
            if (createFolder) await sftp.mkdir(remoteFolder, true);
            else throw new Error(`La cartella remota '${remoteFolder}' non esiste e la creazione automatica è disabilitata.`);
        }
        
        const createdDirs = new Set<string>();
        createdDirs.add(remoteFolder.endsWith('/') ? remoteFolder.slice(0, -1) : remoteFolder);
        
        for (const item of diff) {
            if (isCancelled()) throw new Error('Operazione annullata');
            
            const parentDir = path.posix.dirname(item.remotePath);
            if (!createdDirs.has(parentDir)) {
                await sftp.mkdir(parentDir, true);
                createdDirs.add(parentDir);
            }
            
            onProgress(`Upload: ${item.name}`);
            await sftp.fastPut(item.localPath, item.remotePath);
        }
    } finally {
        await sftp.end();
    }
}

export async function buildFtpDiff(host: string, port: number, user: string, pass: string, localPath: string, remoteFolder: string, secure: boolean, isCancelled: () => boolean = () => false): Promise<DiffItem[]> {
    const attempts: { secure: boolean; label: string }[] = [{ secure, label: secure ? 'FTPS' : 'FTP' }];
    if (secure) attempts.push({ secure: false, label: 'FTP fallback' });

    let lastError: any = null;
    for (const attempt of attempts) {
        const client = new ftp.Client(10000, { allowSeparateTransferHost: false });
        try {
            await client.access({ host, port, user, password: pass, secure: attempt.secure, secureOptions: { rejectUnauthorized: false } });
            if (isCancelled()) throw new Error('Operazione annullata');
            
            const diff: DiffItem[] = [];
            async function syncDir(currentLocalPath: string, currentRemotePath: string) {
                if (isCancelled()) throw new Error('Operazione annullata');
                const entries = fs.readdirSync(currentLocalPath, { withFileTypes: true });
                
                let remoteFiles: ftp.FileInfo[] = [];
                try {
                    remoteFiles = await client.list(currentRemotePath);
                } catch (err) {}
                
                const remoteMap = new Map<string, ftp.FileInfo>();
                for (const file of remoteFiles) remoteMap.set(file.name, file);
                
                for (const entry of entries) {
                    if (isCancelled()) throw new Error('Operazione annullata');
                    const entryLocalPath = path.join(currentLocalPath, entry.name);
                    const entryRemotePath = currentRemotePath.endsWith('/') ? currentRemotePath + entry.name : currentRemotePath + '/' + entry.name;
                    
                    if (entry.isDirectory()) {
                        await syncDir(entryLocalPath, entryRemotePath);
                    } else {
                        const localStat = fs.statSync(entryLocalPath);
                        const remoteFile = remoteMap.get(entry.name);
                        
                        let shouldUpload = true;
                        let type: 'new'|'modified' = 'new';
                        if (remoteFile) {
                            type = 'modified';
                            if (remoteFile.size === localStat.size) {
                                if (remoteFile.modifiedAt && remoteFile.modifiedAt.getTime() >= Math.floor(localStat.mtimeMs) - 2000) {
                                    shouldUpload = false;
                                } else if (!remoteFile.modifiedAt) {
                                    shouldUpload = false;
                                }
                            }
                        }
                        if (shouldUpload) {
                            diff.push({ localPath: entryLocalPath, remotePath: entryRemotePath, type, name: entry.name });
                        }
                    }
                }
            }
            await syncDir(localPath, remoteFolder);
            return diff;
        } catch (err: any) {
            lastError = err;
        } finally {
            client.close();
        }
    }
    throw lastError;
}

export async function uploadFtpList(host: string, port: number, user: string, pass: string, remoteFolder: string, secure: boolean, createFolder: boolean, diff: DiffItem[], onProgress: (msg: string) => void, isCancelled: () => boolean = () => false) {
    if (diff.length === 0) return;
    const attempts: { secure: boolean; label: string }[] = [{ secure, label: secure ? 'FTPS' : 'FTP' }];
    if (secure) attempts.push({ secure: false, label: 'FTP fallback' });

    let lastError: any = null;
    for (const attempt of attempts) {
        const client = new ftp.Client(10000, { allowSeparateTransferHost: false });
        try {
            await client.access({ host, port, user, password: pass, secure: attempt.secure, secureOptions: { rejectUnauthorized: false } });
            if (isCancelled()) throw new Error('Operazione annullata');
            
            if (createFolder) {
                await client.ensureDir(remoteFolder);
            } else {
                try {
                    await client.cd(remoteFolder);
                } catch (err) {
                    throw new Error(`La directory remota '${remoteFolder}' non esiste e la creazione automatica è disabilitata.`);
                }
            }
            
            const createdDirs = new Set<string>();
            createdDirs.add(remoteFolder.endsWith('/') ? remoteFolder.slice(0, -1) : remoteFolder);
            
            for (const item of diff) {
                if (isCancelled()) throw new Error('Operazione annullata');
                
                const parentDir = path.posix.dirname(item.remotePath);
                if (!createdDirs.has(parentDir)) {
                    await client.ensureDir(parentDir);
                    createdDirs.add(parentDir);
                }
                
                onProgress(`Upload: ${item.name}`);
                await client.uploadFrom(item.localPath, item.remotePath);
            }
            return;
        } catch (err: any) {
            lastError = err;
        } finally {
            client.close();
        }
    }
    throw lastError;
}
