const appClient = window.appClient;
const loginBtn = document.getElementById('loginBtn');
const messageDiv = document.getElementById('message');
const passwordInput = document.getElementById('password');
const idInput = document.getElementById('idNumber');

restoreSession();

if (loginBtn && messageDiv && passwordInput && idInput) {
    loginBtn.addEventListener('click', handleLogin);

    [passwordInput, idInput].forEach((input) => {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleLogin();
            }
        });
    });
}

async function handleLogin() {
    const id = idInput.value.trim();
    const password = passwordInput.value.trim();

    if (!id || !password) {
        messageDiv.innerText = 'Please enter both ID and password.';
        messageDiv.style.color = 'red';
        return;
    }

    loginBtn.disabled = true;
    messageDiv.innerText = 'Signing in...';
    messageDiv.style.color = 'white';

    try {
        const user = await appClient.login(id, password);
        redirectByRole(user.role);
    } catch (error) {
        messageDiv.innerText = error.message;
        messageDiv.style.color = 'red';
    } finally {
        loginBtn.disabled = false;
    }
}

async function restoreSession() {
    try {
        const user = await appClient.getCurrentSession({ bypassCache: true });
        if (!user) {
            return;
        }

        redirectByRole(user.role);
    } catch (error) {
        console.error('Failed to restore session:', error);
    }
}

function redirectByRole(role) {
    window.location.replace(String(role).toLowerCase() === 'head_admin'
        ? '/head_admin/dashboard.html'
        : '/employee/employee.html');
}
