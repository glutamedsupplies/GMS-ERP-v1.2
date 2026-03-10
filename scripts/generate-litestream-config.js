#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            continue;
        }
        const key = token.slice(2);
        const next = argv[index + 1];
        if (!next || next.startsWith('--')) {
            args[key] = true;
            continue;
        }
        args[key] = next;
        index += 1;
    }
    return args;
}

function requireArg(args, key) {
    const value = String(args[key] || '').trim();
    if (!value) {
        throw new Error(`Missing required argument --${key}`);
    }
    return value;
}

function walkDbFiles(dataDir) {
    const files = [];
    const masterPath = path.join(dataDir, 'master.db');
    if (fs.existsSync(masterPath)) {
        files.push(masterPath);
    }

    const tenantsDir = path.join(dataDir, 'tenants');
    if (fs.existsSync(tenantsDir)) {
        for (const entry of fs.readdirSync(tenantsDir, { withFileTypes: true })) {
            if (!entry.isFile()) {
                continue;
            }
            if (!entry.name.endsWith('.db')) {
                continue;
            }
            if (/\.backup-\d{8}-\d{6}\.db$/i.test(entry.name)) {
                continue;
            }
            files.push(path.join(tenantsDir, entry.name));
        }
    }

    return files.sort((left, right) => left.localeCompare(right));
}

function quoteYaml(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function buildConfig(options) {
    const dbFiles = walkDbFiles(options.dataDir);
    if (!dbFiles.length) {
        throw new Error(`No SQLite database files found under ${options.dataDir}`);
    }

    const lines = [];
    lines.push('dbs:');

    for (const dbPath of dbFiles) {
        const relativePath = path.relative(options.dataDir, dbPath).replace(/\\/g, '/');
        const replicaPath = `${options.pathPrefix}/${relativePath}`;
        lines.push(`  - path: ${quoteYaml(dbPath)}`);
        lines.push('    replicas:');
        lines.push('      - type: s3');
        lines.push(`        bucket: ${quoteYaml(options.bucket)}`);
        lines.push(`        path: ${quoteYaml(replicaPath)}`);
        lines.push(`        endpoint: ${quoteYaml(`https://${options.accountId}.r2.cloudflarestorage.com`)}`);
        lines.push(`        access-key-id: ${quoteYaml(options.accessKeyId)}`);
        lines.push(`        secret-access-key: ${quoteYaml(options.secretAccessKey)}`);
        lines.push('');
    }

    return `${lines.join('\n').trim()}\n`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const dataDir = path.resolve(requireArg(args, 'data-dir'));
    const bucket = requireArg(args, 'bucket');
    const accountId = requireArg(args, 'account-id');
    const accessKeyId = requireArg(args, 'access-key-id');
    const secretAccessKey = requireArg(args, 'secret-access-key');
    const output = String(args.output || '').trim();
    const pathPrefix = String(args['path-prefix'] || 'gms').trim() || 'gms';

    if (!fs.existsSync(dataDir)) {
        throw new Error(`Data directory does not exist: ${dataDir}`);
    }

    const content = buildConfig({
        dataDir,
        bucket,
        accountId,
        accessKeyId,
        secretAccessKey,
        pathPrefix
    });

    if (output) {
        fs.writeFileSync(path.resolve(output), content, 'utf8');
        console.log(`Litestream config written to ${path.resolve(output)}`);
        return;
    }

    process.stdout.write(content);
}

try {
    main();
} catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
}
