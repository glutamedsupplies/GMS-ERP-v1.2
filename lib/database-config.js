function normalizeEnvValue(value) {
    return String(value || '').trim();
}

function getDatabaseConnectionString({ preferNonPooling = false } = {}) {
    const primaryCandidates = preferNonPooling
        ? [
            process.env.DATABASE_URL,
            process.env.POSTGRES_URL_NON_POOLING,
            process.env.POSTGRES_URL,
            process.env.POSTGRES_PRISMA_URL
        ]
        : [
            process.env.DATABASE_URL,
            process.env.POSTGRES_URL,
            process.env.POSTGRES_URL_NON_POOLING,
            process.env.POSTGRES_PRISMA_URL
        ];

    return primaryCandidates
        .map(normalizeEnvValue)
        .find(Boolean) || '';
}

function getDatabaseEnvNames() {
    return [
        'DATABASE_URL',
        'POSTGRES_URL',
        'POSTGRES_URL_NON_POOLING',
        'POSTGRES_PRISMA_URL'
    ];
}

function buildMissingDatabaseUrlMessage(context = 'runtime') {
    const scope = String(context || 'runtime').trim() || 'runtime';
    return `${getDatabaseEnvNames().join(' or ')} is required for PostgreSQL ${scope}.`;
}

module.exports = {
    buildMissingDatabaseUrlMessage,
    getDatabaseConnectionString,
    getDatabaseEnvNames
};
