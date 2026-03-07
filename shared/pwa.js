(function registerPwaSupport() {
    const installButton = document.getElementById('installAppBtn');
    const statusMessage = document.getElementById('message');
    let deferredPrompt = null;

    function setInstallStatus(text, color = '#ffffff') {
        if (!statusMessage) {
            return;
        }
        statusMessage.textContent = text;
        statusMessage.style.color = color;
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').catch((error) => {
                console.error('Service worker registration failed:', error);
            });
        });
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        if (installButton) {
            installButton.hidden = false;
        }
        setInstallStatus('Install prompt is ready. Tap Install.');
    });

    if (installButton) {
        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) {
                setInstallStatus('If no install prompt appears, open this site in Chrome or Edge and use Add to Home Screen or Install App from the browser menu.', '#e5e7eb');
                return;
            }

            deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            setInstallStatus(
                choice.outcome === 'accepted'
                    ? 'App installation started.'
                    : 'Install prompt was dismissed.',
                choice.outcome === 'accepted' ? '#86efac' : '#e5e7eb'
            );
            deferredPrompt = null;
            installButton.hidden = true;
        });
    }

    window.addEventListener('appinstalled', () => {
        setInstallStatus('GMS ERP installed successfully.', '#86efac');
        if (installButton) {
            installButton.hidden = true;
        }
        deferredPrompt = null;
    });
})();
