const { createRequestListener } = require('../lib/http-server');

const requestListener = createRequestListener();

function normalizeRewrittenApiUrl(req) {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.searchParams.get('__pathname');
    if (!pathname) {
        return req.url || '/';
    }

    url.searchParams.delete('__pathname');
    const search = url.searchParams.toString();
    return `${pathname}${search ? `?${search}` : ''}`;
}

module.exports = (req, res) => {
    req.url = normalizeRewrittenApiUrl(req);
    return requestListener(req, res);
};
