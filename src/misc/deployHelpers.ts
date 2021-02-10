import Command from '@oclif/command';
import { IPermission } from '@rocket.chat/apps-engine/definition/permissions/IPermission';
import * as FormData from 'form-data';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { Response } from 'node-fetch';

import { AppPackager, FolderDetails } from '.';

export const getServerInfo = async (fd: FolderDetails,  flags: {[key: string]: any}):
    Promise<{[key: string]: any}> => {
        let loginInfo = flags;
        try {
            if (await fd.doesFileExist(fd.mergeWithFolder('.rcappsconfig'))) {
                const data = JSON.parse(await fs.promises.readFile(fd.mergeWithFolder('.rcappsconfig'), 'utf-8'));
                loginInfo = { ...data, ...loginInfo};
            }
        } catch (e) {
            throw new Error(e && e.message ? e.message : e);
        }

        try {
            const serverInfo = await fetch(loginInfo.url + '/api/info').then((response) => response.json());

            loginInfo.serverVersion = serverInfo.version;
        } catch (e) {
            throw new Error(`Problems conecting to Rocket.Chat at ${loginInfo.url} - please check the address`);
        }

        // tslint:disable-next-line:max-line-length
        const providedLoginArguments = ((loginInfo.username && loginInfo.password) || (loginInfo.userId && loginInfo.token));
        if (loginInfo.url && providedLoginArguments) {
            return loginInfo;
        }

        if (!loginInfo.url && providedLoginArguments) {
            throw new Error(`
    No url found.
    Consider adding url with the flag --url
    or create a .rcappsconfig file and add the url as
    {
        "url": "your-server-url"
    }
            `);
        } else {
            if (loginInfo.password || loginInfo.username) {
                if (!loginInfo.password) {
                    throw new Error(`
    No password found for username.
    Consider adding password as a flag with -p="your-password"
    or create a .rcappsconfig file and add the password as
    {
        "password":"your-password"
    }
                    `);
                } else {
                    throw new Error(`
    No username found for given password.
    Consider adding username as a flag with -u="your-username"
    or create a .rcappsconfig file and add the username as
    {
        "username":"your-username"
    }
                    `);
                }
            } else if (loginInfo.token || loginInfo.userId) {
                if (!loginInfo.token) {
                    throw new Error(`
    No token found for given user Id.
    Consider adding token as a flag with -t="your-token"
    or create a .rcappsconfig file and add the token as
    {
        "token":"your-token"
    }
                    `);
                } else {
                    throw new Error(`
    No user Id found for given token.
    Consider adding user Id as a flag with -i="your-userId"
    or create a .rcappsconfig file and add the user Id as
    {
        "userId":"your-userId"
    }
                    `);
                }
            } else {
                throw new Error(`
    No login arguments found.
    Consider adding the server url with either username and password
    or userId and personal access token through flags
    or create a .rcappsconfig file to pass them as a JSON object.
                `);
            }
        }
};

export const packageAndZip = async (command: Command, fd: FolderDetails): Promise<string> => {
        const packager = new AppPackager(command, fd);
        try {
            return  packager.zipItUp();
        } catch (e) {
            throw new Error(e);
        }
};

export const uploadApp = async (flags: { [key: string]: any }, fd: FolderDetails, zipname: string) => {
        const data = new FormData();

        data.append('app', fs.createReadStream(fd.mergeWithFolder(zipname)));
        if (fd.info.permissions) {
            data.append('permissions', JSON.stringify(fd.info.permissions));
        }
        try {
            await asyncSubmitData(data, flags, fd);
        } catch (e) {
            throw new Error(e);
        }
};

// tslint:disable-next-line:max-line-length
export const checkUpload = async (flags: { [key: string]: any }, fd: FolderDetails): Promise<boolean> => {
    let authResult;
    if (!flags.token) {
        let credentials: { username: string, password: string, code?: string };
        credentials = { username: flags.username, password: flags.password };
        if (flags.code) {
            credentials.code = flags.code;
        }

        authResult = await fetch(normalizeUrl(flags.url, '/api/v1/login'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
        }).then((res: Response) => res.json());

        if (authResult.status === 'error' || !authResult.data) {
            throw new Error('Invalid username and password or missing 2FA code (if active)');
        }
    } else {
        const verificationResult = await fetch(normalizeUrl(flags.url, '/api/v1/me'), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Auth-Token': flags.token,
                'X-User-Id': flags.userId,
            },
        }).then((res: Response) => res.json());

        if (!verificationResult.success) {
            throw new Error('Invalid API token');
        }

        authResult = { data: { authToken: flags.token, userId: flags.userId } };
    }
    const endpoint = `/api/apps/${fd.info.id}`;

    const findApp = await fetch(normalizeUrl(flags.url, endpoint), {
        method: 'GET',
        headers: {
            'X-Auth-Token': authResult.data.authToken,
            'X-User-Id': authResult.data.userId,
        },
    }).then((res: Response) => res.json());
    return findApp.success;
};

export const asyncSubmitData = async (data: FormData, flags: { [key: string]: any },
                                      fd: FolderDetails): Promise<void> => {
        let authResult;
        if (!flags.url) {
            throw new Error('Url not found');
        }
        if (!flags.token) {
            let credentials: { username: string, password: string, code?: string };
            credentials = { username: flags.username, password: flags.password };
            if (flags.code) {
                credentials.code = flags.code;
            }

            authResult = await fetch(normalizeUrl(flags.url, '/api/v1/login'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(credentials),
            }).then((res: Response) => res.json());

            if (authResult.status === 'error' || !authResult.data) {
                throw new Error('Invalid username and password or missing 2FA code (if active)');
            }
        } else {
            const verificationResult = await fetch(normalizeUrl(flags.url, '/api/v1/me'), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Auth-Token': flags.token,
                    'X-User-Id': flags.userId,
                },
            }).then((res: Response) => res.json());

            if (!verificationResult.success) {
                throw new Error('Invalid API token');
            }

            authResult = { data: { authToken: flags.token, userId: flags.userId } };
        }

        let endpoint = '/api/apps';
        if (flags.update) {
            endpoint += `/${fd.info.id}`;
        }

        const deployResult = await fetch(normalizeUrl(flags.url, endpoint), {
            method: 'POST',
            headers: {
                'X-Auth-Token': authResult.data.authToken,
                'X-User-Id': authResult.data.userId,
            },
            body: data,
        }).then((res: Response) => res.json());
        if (deployResult.status === 'error') {
            throw new Error(`Unknown error occurred while deploying ${JSON.stringify(deployResult)}`);
        } else if (!deployResult.success) {
            if (deployResult.status === 'compiler_error') {
                throw new Error(`Deployment compiler errors: \n${ JSON.stringify(deployResult.messages, null, 2) }`);
            }
            throw new Error(`Deployment error: ${ deployResult.error }`);
        }
    };

    // expects the `path` to start with the /
export const normalizeUrl = (url: string, path: string): string => {
        return url.replace(/\/$/, '') + path;
};

export const getIgnoredFiles = async (fd: FolderDetails): Promise<Array<string>> => {
    try {
        if (await fd.doesFileExist(fd.mergeWithFolder('.rcappsconfig'))) {
            const data = await fs.promises.readFile(fd.mergeWithFolder('.rcappsconfig'), 'utf-8');
            const parsedData =  JSON.parse(data);
            return parsedData.ignoredFiles;
        } else {
            return [
                '**/dist/**',
            ];
        }
    } catch (e) {
        throw new Error(e && e.message ? e.message : e);
    }
};
