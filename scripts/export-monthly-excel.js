#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const store = require('../lib/sqlite');
const {
    getMonthBounds,
    parseMonth,
    safeName,
    writeCompanyWorkbookFile
} = require('../lib/monthly-excel-export');

function normalizeText(value) {
    return String(value || '').trim();
}

function parseArgs(argv = []) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 1) {
        const entry = argv[index];
        if (!entry.startsWith('--')) {
            continue;
        }
        const key = entry.slice(2);
        const next = argv[index + 1];
        if (!next || next.startsWith('--')) {
            args.set(key, true);
            continue;
        }
        args.set(key, next);
        index += 1;
    }
    return args;
}

function resolveCompanySelection(companies, selection) {
    const normalized = normalizeText(selection);
    if (!normalized || normalized.toLowerCase() === 'all') {
        return companies;
    }

    const needle = normalized.toLowerCase();
    const matches = companies.filter((company) => {
        return [
            company.id,
            company.company_code,
            company.name,
            company.app_name
        ].some((value) => normalizeText(value).toLowerCase() === needle);
    });

    if (!matches.length) {
        throw new Error(`Company "${selection}" was not found.`);
    }

    return matches;
}

function ensureDirectory(targetPath) {
    fs.mkdirSync(targetPath, { recursive: true });
}

async function run() {
    const args = parseArgs(process.argv.slice(2));
    const fallbackMonth = store.getMonthKey(new Date()) || '';
    const monthInput = normalizeText(args.get('month')) || fallbackMonth;
    const parsedMonth = parseMonth(monthInput);
    if (!parsedMonth) {
        throw new Error('Invalid --month value. Use YYYY-MM.');
    }

    store.ensureSystemReady();

    const { dateFrom, dateTo } = getMonthBounds(parsedMonth.year, parsedMonth.month);
    const monthKey = `${parsedMonth.year}-${String(parsedMonth.month).padStart(2, '0')}`;

    const companies = resolveCompanySelection(store.listCompanies(), args.get('company'));
    if (!companies.length) {
        throw new Error('No companies found to export.');
    }

    const repoRoot = path.resolve(__dirname, '..');
    const baseExportRoot = normalizeText(args.get('out-dir'))
        || normalizeText(process.env.ATTENDANCE_EXPORT_DIR)
        || path.join(repoRoot, 'exports');
    const monthDir = path.join(baseExportRoot, `excel-${monthKey}`);
    ensureDirectory(monthDir);

    for (const company of companies) {
        const safeCompanyName = safeName(company.name || company.app_name || company.company_code || company.id);
        const companyDir = path.join(monthDir, `${safeCompanyName}-${company.id}`);
        ensureDirectory(companyDir);
        const outputPath = path.join(companyDir, `GMS_${safeCompanyName}_${monthKey}.xlsx`);

        await writeCompanyWorkbookFile({
            company,
            monthKey,
            dateFrom,
            dateTo,
            outputPath
        });

        console.log(`[excel] exported ${company.name || company.id} -> ${outputPath}`);
    }
}

run().catch((error) => {
    console.error('[excel] export failed:', error);
    process.exitCode = 1;
}).finally(() => {
    store.closeAll?.();
});
