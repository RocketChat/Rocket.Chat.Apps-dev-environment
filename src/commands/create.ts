import { Command, flags } from '@oclif/command';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import chalk from 'chalk';
import cli from 'cli-ux';
import pascalCase = require('pascal-case');
import * as path from 'path';
import * as semver from 'semver';
import * as uuid from 'uuid';

import {
    AppCompiler,
    AppCreator,
    AppPackager,
    FolderDetails,
    VariousUtils,
} from '../misc';

export default class Create extends Command {
    public static description = 'simplified way of creating an app';

    public static flags = {
        help: flags.help({ char: 'h' }),
        icon: flags.string(),
    };

    public static args = [
        {
            name: 'name',
            required: false,
            description: 'Change the name of the entry folder',
        },
    ];

    public async run() {
        if (!semver.satisfies(process.version, '>=4.2.0')) {
            this.error('NodeJS version needs to be at least 4.2.0 or higher.');
            return;
        }

        const info: IAppInfo = {
            id: uuid.v4(),
            version: '0.0.1',
            requiredApiVersion: VariousUtils.getTsDefVersion(),
            iconFile: 'icon.png',
            author: {},
        } as IAppInfo;

        this.log('Let\'s get started creating your app.');
        this.log('We need some information first:');
        this.log('');

        info.name = await cli.prompt(chalk.bold('   App Name'));
        info.nameSlug = VariousUtils.slugify(info.name);
        info.classFile = `${ pascalCase(info.name) }App.ts`;

        info.description = await cli.prompt(chalk.bold('   App Description'));
        info.author.name = await cli.prompt(chalk.bold('   Author\'s Name'));
        info.author.homepage = await cli.prompt(chalk.bold('   Author\'s Home Page'));
        info.author.support = await cli.prompt(chalk.bold('   Author\'s Support Page'));

        this.log('');

        let folder = path.join(process.cwd(), info.nameSlug);

        const { flags, args }  = this.parse(Create);
        const fd = new FolderDetails(this);
        if (args.name) {
            const newPath = path.resolve(args.name);
            if (!fd.doesFolderExist(newPath) || await fd.isFolderEmpty(newPath)) {
                folder = newPath;
            } else {
                this.log(chalk.bgRed(`\nDestination path ${args.name} exists and is not empty`));
                return;
            }
        }
        cli.action.start(`Creating a Rocket.Chat App in ${ chalk.green(folder) }`);

        fd.setAppInfo(info);
        fd.setFolder(folder);
        if (flags.icon) {
            const imageIconPath = path.resolve(flags.icon);
            if (await fd.doesFileExist(imageIconPath)) {
                fd.setImageIconPath(imageIconPath);
            } else {
                cli.action.stop(chalk.bgRed(`\nInvalid image path provided. Could not resolve: "${ flags.icon }"`));
                return;
            }
        }

        const creator = new AppCreator(fd, this);
        await creator.writeFiles();

        try {
            await fd.readInfoFile();
        } catch (e) {
            this.error(e && e.message ? e.message : e);
            return;
        }

        const compiler = new AppCompiler(this, fd);
        const report = compiler.logDiagnostics();

        if (!report.isValid) {
            throw new Error('invalid.');
        }

        const packager = new AppPackager(this, fd);
        await packager.zipItUp();

        cli.action.stop(chalk.cyan('done!'));
    }
}
