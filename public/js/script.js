// Global variables
let token = localStorage.getItem('token');
let currentUser = null;
let isEditing = false;

// DOM Elements
const authContainer = document.getElementById('auth-container');
const mainContent = document.getElementById('main-content');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const accountForm = document.getElementById('account-form');
const accountsList = document.getElementById('accounts-list');
const usernameDisplay = document.getElementById('username-display');

// Add these variables at the top with other global variables
const dbStatusIndicator = document.getElementById('db-status-indicator');
const dbStatusText = document.getElementById('db-status-text');

// Update the DOM element references
const statusText = document.querySelector('.status-text');
const statusInfo = document.querySelector('.status-info');

// Event Listeners
loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
accountForm.addEventListener('submit', handleAccountSubmit);

// Check authentication status on page load
checkAuth();

// Auth Functions
async function checkAuth() {
    if (!token) {
        showAuthForms();
        return;
    }

    try {
        const response = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
            currentUser = await response.json();
            showMainContent();
            loadAccounts();
        } else {
            localStorage.removeItem('token');
            token = null;
            showAuthForms();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthForms();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            token = data.token;
            localStorage.setItem('token', token);
            currentUser = data.user;
            showMainContent();
            loadAccounts();
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Login failed:', error);
        alert('Login failed. Please try again.');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            token = data.token;
            localStorage.setItem('token', token);
            currentUser = data.user;
            showMainContent();
            loadAccounts();
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Registration failed:', error);
        alert('Registration failed. Please try again.');
    }
}

function logout() {
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    showAuthForms();
}

// Account Functions
async function loadAccounts() {
    const isConnected = await checkDatabaseStatus();
    if (!isConnected) {
        accountsList.innerHTML = '<div class="text-danger">Cannot load accounts: Database is not connected</div>';
        return;
    }
    
    try {
        const response = await fetch('/api/accounts', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
            const accounts = await response.json();
            await displayAccounts(accounts);
        } else {
            alert('Failed to load accounts');
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
        alert('Error loading accounts');
    }
}

// Add this function for showing notifications
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

async function handleAccountSubmit(e) {
    e.preventDefault();
    
    const isConnected = await checkDatabaseStatus();
    if (!isConnected) {
        showNotification('Cannot save: Database is not connected', 'error');
        return;
    }

    try {
        // Validate required fields
        const website = document.getElementById('website').value.trim();
        const name = document.getElementById('name').value.trim();
        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const note = document.getElementById('note').value.trim();
        const fileInput = document.getElementById('attachedFile');

        // Only check file size
        if (fileInput.files[0]) {
            const file = fileInput.files[0];
            // Increased size limit to 50MB
            if (file.size > 50 * 1024 * 1024) {
                throw new Error('File size must be less than 50MB');
            }
        }

        if (!name) throw new Error('Name is required');
        if (!username) throw new Error('Username is required');
        if (!email || !email.includes('@')) throw new Error('Valid email is required');
        if (!password) throw new Error('Password is required');

        // Try to fetch website favicon if website URL is provided
        let logoUrl = null;
        if (website) {
            try {
                const domain = getDomain(website);
                if (domain) {
                    logoUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
                }
            } catch (error) {
                console.warn('Failed to get favicon URL:', error);
            }
        }

        // Prepare account data
        const accountData = {
            website,
            name,
            username,
            email,
            password,
            note,
            logoUrl
        };

        const accountId = document.getElementById('account-id').value;
        const method = isEditing ? 'PUT' : 'POST';
        const url = isEditing ? `/api/accounts/${accountId}` : '/api/accounts';

        // First save the account data
        const response = await fetch(url, {
            method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(accountData)
        });

        const responseData = await response.json();
        
        if (!response.ok) {
            throw new Error(responseData.message || 'Failed to save account');
        }

        // Handle file upload if present
        if (fileInput.files[0]) {
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    const formData = new FormData();
                    formData.append('attachedFile', fileInput.files[0]);

                    const uploadResponse = await fetch(`/api/accounts/upload/${responseData._id}`, {
                        method: 'POST',
                        headers: { 
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });

                    if (!uploadResponse.ok) {
                        const uploadData = await uploadResponse.json();
                        if (retryCount === maxRetries - 1) {
                            console.error('File upload failed after retries:', uploadData);
                            showNotification(`Account saved but file upload failed: ${uploadData.message || 'Upload error'}`, 'warning');
                            break;
                        }
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                        continue;
                    }

                    // If upload successful, break the retry loop
                    break;

                } catch (uploadError) {
                    if (retryCount === maxRetries - 1) {
                        console.error('File upload error:', uploadError);
                        showNotification(`Account saved but file upload failed: ${uploadError.message || 'Upload error'}`, 'warning');
                        break;
                    }
                    retryCount++;
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }
        }

        // Reset form and reload accounts
        resetForm();
        await loadAccounts();
        
        // Show success message
        showNotification(isEditing ? 'Account updated successfully!' : 'Account created successfully!');
    } catch (error) {
        console.error('Error saving account:', error);
        showNotification(error.message || 'Error saving account', 'error');
    }
}

async function editAccount(id) {
    const isConnected = await checkDatabaseStatus();
    if (!isConnected) {
        alert('Cannot edit: Database is not connected');
        return;
    }
    
    try {
        const response = await fetch(`/api/accounts/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Failed to load account details');
        }

        const account = await response.json();
        fillAccountForm(account);
        isEditing = true;
        
        // Scroll to the form
        document.querySelector('.account-form-container').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Error loading account details:', error);
        alert(error.message || 'Error loading account details');
    }
}

async function deleteAccount(id) {
    const isConnected = await checkDatabaseStatus();
    if (!isConnected) {
        showNotification('Cannot delete: Database is not connected', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this account?')) {
        return;
    }

    try {
        const response = await fetch(`/api/accounts/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
            showNotification('Account deleted successfully');
            loadAccounts();
        } else {
            showNotification('Failed to delete account', 'error');
        }
    } catch (error) {
        console.error('Error deleting account:', error);
        showNotification('Error deleting account', 'error');
    }
}

// UI Functions
function showLoginForm() {
    document.querySelector('.auth-toggle button:first-child').classList.add('active');
    document.querySelector('.auth-toggle button:last-child').classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
}

function showRegisterForm() {
    document.querySelector('.auth-toggle button:first-child').classList.remove('active');
    document.querySelector('.auth-toggle button:last-child').classList.add('active');
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
}

function showAuthForms() {
    authContainer.classList.remove('hidden');
    mainContent.classList.add('hidden');
}

function showMainContent() {
    authContainer.classList.add('hidden');
    mainContent.classList.remove('hidden');
    usernameDisplay.textContent = currentUser.username;
}

function getAccountColor(name) {
    // Generate a consistent color based on the name
    const hash = name.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    const hue = hash % 360;
    return `hsl(${hue}, 65%, 45%)`;
}

function createAccountLogo(account) {
    const initial = (account.name || '??').substring(0, 2).toUpperCase();
    const color = getAccountColor(account.name);
    
    return `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
            <rect width="40" height="40" fill="${color}" rx="4"/>
            <text x="50%" y="50%" font-family="Arial" font-size="20" 
                fill="white" text-anchor="middle" dy=".3em"
                font-weight="bold">${initial}</text>
        </svg>
    `)}`;
}

// Add this function before getFaviconUrl
function getDomain(url) {
    if (!url) return null;
    
    try {
        // Remove any whitespace and convert to lowercase
        url = url.trim().toLowerCase();
        
        // Add protocol if missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (error) {
        console.debug('Invalid URL:', url);
        return null;
    }
}

function getFaviconUrl(domain) {
    if (!domain) return null;

    // Return specific icons for known services
    if (domain.includes('gmail.com')) {
        return 'https://www.google.com/gmail/about/static/images/logo-gmail.png?cache=1adba63';
    }
    if (domain.includes('google.com')) {
        return 'https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png';
    }

    // For other domains, try DuckDuckGo's favicon service
    return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

function displayAccounts(accounts) {
    const accountsList = document.getElementById('accounts-list');
    accountsList.innerHTML = '';

    accounts.forEach(account => {
        let faviconUrl = null;
        if (account.website) {
            try {
                const domain = getDomain(account.website);
                faviconUrl = getFaviconUrl(domain);
            } catch (error) {
                console.debug('Failed to get favicon:', error);
            }
        }

        const defaultLogo = createAccountLogo(account);
        
        const accountHtml = `
            <div class="account-card">
                <div class="account-logo-container">
                    <img 
                        src="${faviconUrl || defaultLogo}"
                        alt="${account.name}"
                        class="account-logo"
                        onerror="this.onerror=null; this.src='${defaultLogo}';"
                    />
                </div>
                <div class="account-info">
                    <h3>#${account.serialNumber} - ${account.name}</h3>
                    <p><strong>Website:</strong> ${account.website || 'N/A'}</p>
                    <p><strong>Username:</strong> ${account.username || 'N/A'}</p>
                    <p><strong>Email:</strong> ${account.email || 'N/A'}</p>
                    ${account.note ? `<p><strong>Note:</strong> ${account.note}</p>` : ''}
                    ${account.attachedFile ? `
                        <p>
                            <strong>Attachment:</strong> 
                            <span class="file-actions">
                                <a href="#" onclick="viewFile('${account._id}', '${account.attachedFile.filename}'); return false;" class="attachment-link">
                                    ${account.attachedFile.filename}
                                </a>
                                <button onclick="viewFile('${account._id}', '${account.attachedFile.filename}', true)" class="download-btn" title="Download file">
                                    <i class="fas fa-download"></i>
                                </button>
                            </span>
                        </p>` : ''
                    }
                </div>
                <div class="account-actions">
                    <button onclick="editAccount('${account._id}')" class="edit-btn">Edit</button>
                    <button onclick="deleteAccount('${account._id}')" class="delete-btn">Delete</button>
                </div>
            </div>
        `;
        accountsList.insertAdjacentHTML('beforeend', accountHtml);
    });
}

function fillAccountForm(account) {
    document.getElementById('account-id').value = account._id || '';
    document.getElementById('website').value = account.website || '';
    document.getElementById('name').value = account.name || '';
    document.getElementById('username').value = account.username || '';
    document.getElementById('email').value = account.email || '';
    document.getElementById('password').value = account.password || '';
    document.getElementById('note').value = account.note || '';
}

function resetForm() {
    accountForm.reset();
    document.getElementById('account-id').value = '';
    document.getElementById('attachedFile').value = ''; // Clear file input
    isEditing = false;
}

function togglePasswordVisibility(icon) {
    const input = icon.previousElementSibling;
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function generatePassword(inputId) {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
    let password = '';
    
    // Ensure at least one of each character type
    password += charset.match(/[a-z]/)[0]; // lowercase
    password += charset.match(/[A-Z]/)[0]; // uppercase
    password += charset.match(/[0-9]/)[0]; // number
    password += charset.match(/[^a-zA-Z0-9]/)[0]; // special character

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
    }

    // Shuffle the password
    password = password.split('').sort(() => Math.random() - 0.5).join('');

    // Set the value to the specified input field
    document.getElementById(inputId).value = password;

    // Show the password by changing the input type temporarily
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling;
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');

    // Hide the password after 3 seconds
    setTimeout(() => {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }, 3000);
}

// Update the checkDatabaseStatus function
async function checkDatabaseStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();
        
        if (status.isConnected) {
            statusText.textContent = 'System Status: Healthy';
            statusInfo.textContent = `Database: ${status.state} | GridFS: initialized`;
            document.querySelector('.system-status').style.backgroundColor = '#2c6e49';
        } else {
            statusText.textContent = 'System Status: Error';
            statusInfo.textContent = `Database: ${status.state} | GridFS: not initialized`;
            document.querySelector('.system-status').style.backgroundColor = '#dc3545';
        }
        
        return status.isConnected;
    } catch (error) {
        console.error('Error checking database status:', error);
        statusText.textContent = 'System Status: Error';
        statusInfo.textContent = 'Database: disconnected | GridFS: not initialized';
        document.querySelector('.system-status').style.backgroundColor = '#dc3545';
        return false;
    }
}

// Start status monitoring
function startStatusMonitoring() {
    checkDatabaseStatus();
    setInterval(checkDatabaseStatus, 30000);
}

// Add this to window load event
window.addEventListener('load', () => {
    startStatusMonitoring();
});

// Add CSS for the new buttons
const style = document.createElement('style');
style.textContent = `
    .edit-btn {
        background-color: #007bff;
        color: white;
        border: none;
        padding: 5px 15px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    .edit-btn:hover {
        background-color: #0056b3;
    }
    .delete-btn {
        background-color: #dc3545;
        color: white;
        border: none;
        padding: 5px 15px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    .delete-btn:hover {
        background-color: #c82333;
    }
    .account-info p {
        margin: 5px 0;
    }
    .attachment-link {
        color: #007bff;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 5px;
    }
    .attachment-link:hover {
        text-decoration: underline;
    }
    .attachment-link::before {
        content: '📎';
    }
    .account-logo-container {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 15px;
        overflow: hidden;
    }
    .account-logo {
        width: 40px;
        height: 40px;
        object-fit: contain;
        transition: transform 0.3s ease;
    }
    .account-logo:hover {
        transform: scale(1.1);
    }
    .account-card {
        display: flex;
        align-items: flex-start;
        padding: 20px;
        border: 1px solid #dee2e6;
        border-radius: 12px;
        margin-bottom: 15px;
        background-color: white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .account-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    .account-info {
        flex-grow: 1;
    }
    .account-actions {
        display: flex;
        gap: 10px;
    }
    .account-info h3 {
        margin: 0 0 12px 0;
        color: #333;
        font-size: 1.2em;
    }
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    }
    
    .notification-content {
        padding: 15px 20px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        background: white;
        border-left: 4px solid #2c6e49;
    }
    
    .notification.error .notification-content {
        border-left-color: #dc3545;
    }
    
    .notification.warning .notification-content {
        border-left-color: #ffc107;
    }
    
    .notification button {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
        padding: 0 5px;
    }
    
    .notification button:hover {
        color: #333;
    }
    
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Add the viewFile function to handle file viewing
async function viewFile(accountId, filename, download = false) {
    try {
        // First ensure we have a valid token
        if (!token) {
            showNotification('Please log in to view files', 'error');
            return;
        }

        // Generate temporary access URL
        const response = await fetch(`/api/accounts/file/${accountId}/generate-access`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401) {
            // Token expired or invalid, try to refresh the page to get new token
            showNotification('Session expired. Please log in again.', 'error');
            logout();
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to generate file access URL');
        }

        const data = await response.json();
        if (data.success && data.url) {
            // Construct the URL with both temp token and auth token
            const baseUrl = data.url;
            const downloadParam = download ? '&download=true' : '';
            const authToken = encodeURIComponent(token);
            const finalUrl = `${baseUrl}&token=${authToken}${downloadParam}`;

            if (download) {
                // Create a temporary link to download the file
                const link = document.createElement('a');
                link.href = finalUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                window.open(finalUrl, '_blank');
            }
        } else {
            throw new Error('Invalid response from server');
        }
    } catch (error) {
        console.error('Error viewing file:', error);
        showNotification('Error viewing file: ' + error.message, 'error');
    }
}

// Add styles for file actions
const fileActionsStyle = document.createElement('style');
fileActionsStyle.textContent = `
    .file-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
    }
    .download-btn {
        background: none;
        border: none;
        color: #007bff;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        transition: background-color 0.2s;
    }
    .download-btn:hover {
        background-color: rgba(0, 123, 255, 0.1);
    }
`;
document.head.appendChild(fileActionsStyle); 