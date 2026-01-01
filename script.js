// Firebase Application with Password Protection
class FirebaseAdminPanel {
    constructor() {
        this.app = null;
        this.database = null;
        this.accountsRef = null;
        
        this.allAccounts = [];
        this.filteredAccounts = [];
        this.currentPage = 1;
        this.rowsPerPage = 10;
        this.autoRefreshInterval = 0;
        this.refreshTimer = null;
        this.currentFile = null;
        this.fileAccounts = [];
        
        // Password protection
        this.ADMIN_PASSWORD = "KRN"; 
        this.pendingAction = null;
        this.copyData = null;
        
        this.init();
    }
    
    init() {
        this.initializeFirebase();
        this.setupEventListeners();
        this.loadSettings();
        this.updateLastUpdated();
        this.setupMobileDetection();
    }
    
    setupMobileDetection() {
        this.isMobile = window.innerWidth <= 768;
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
            this.renderTable();
        });
    }
    
    async initializeFirebase() {
        try {
            const { initializeApp, getDatabase, ref } = window.firebaseModules;
            this.app = initializeApp(window.firebaseConfig);
            this.database = getDatabase(this.app);
            this.accountsRef = ref(this.database, 'accounts');
            
            this.showAlert('Firebase initialized successfully', 'success');
            this.loadAccounts();
            this.setupAutoRefresh();
        } catch (error) {
            console.error('Firebase initialization error:', error);
            this.showAlert('Firebase initialization failed: ' + error.message, 'error');
        }
    }
    
    loadAccounts() {
        const { onValue } = window.firebaseModules;
        
        onValue(this.accountsRef, (snapshot) => {
            this.allAccounts = [];
            snapshot.forEach((childSnapshot) => {
                const account = childSnapshot.val();
                account.id = childSnapshot.key;
                this.allAccounts.push(account);
            });
            
            this.updateStats();
            this.filteredAccounts = [...this.allAccounts];
            this.renderTable();
            this.updateLastUpdated();
        }, (error) => {
            console.error('Database error:', error);
            this.showAlert('Database connection error', 'error');
        });
    }
    
    // Update statistics
    updateStats() {
        document.getElementById('total-accounts').textContent = this.formatNumber(this.allAccounts.length);
        
        const rareAccounts = this.allAccounts.filter(acc => 
            acc.rare_types && acc.rare_types.length > 0
        ).length;
        document.getElementById('rare-accounts').textContent = this.formatNumber(rareAccounts);
        
        document.getElementById('file-accounts').textContent = this.formatNumber(this.fileAccounts.length);
    }
    
    // Update last updated time
    updateLastUpdated() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('last-updated').textContent = timeString;
    }
    
    // Render accounts table (optimized for mobile)
    renderTable() {
        const tableBody = document.getElementById('table-body');
        
        if (this.filteredAccounts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="error">
                        <ion-icon name="alert-circle-outline"></ion-icon>
                        <p>No accounts found</p>
                        <p class="text-muted">Upload a JSON file to add accounts</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.rowsPerPage;
        const endIndex = Math.min(startIndex + this.rowsPerPage, this.filteredAccounts.length);
        const pageAccounts = this.filteredAccounts.slice(startIndex, endIndex);
        
        // Update pagination buttons
        document.getElementById('prev-btn').disabled = this.currentPage === 1;
        document.getElementById('next-btn').disabled = endIndex >= this.filteredAccounts.length;
        document.getElementById('page-info').textContent = 
            `Page ${this.currentPage} of ${Math.ceil(this.filteredAccounts.length / this.rowsPerPage)}`;
        
        // Render table rows
        tableBody.innerHTML = '';
        pageAccounts.forEach((account, index) => {
            const row = document.createElement('tr');
            
            // Format rare types
            let rareTypesHtml = '<div class="rare-tags">';
            if (account.rare_types && account.rare_types.length > 0) {
                account.rare_types.forEach(type => {
                    rareTypesHtml += `
                        <span class="rare-tag">
                            <ion-icon name="star-outline"></ion-icon>
                            ${type}
                        </span>
                    `;
                });
            } else {
                rareTypesHtml += '<span class="text-muted">None</span>';
            }
            rareTypesHtml += '</div>';
            
            // Password display (masked)
            const passwordDisplay = '•'.repeat(8);
            
            // Action buttons (different for mobile)
            let actionButtonsHtml = '';
            if (this.isMobile) {
                // Mobile: Icons only
                actionButtonsHtml = `
                    <div class="action-buttons">
                        <button class="action-btn copy-btn" onclick="adminPanel.requestCopyAccount(${index})" 
                                title="Copy Account">
                            <ion-icon name="copy-outline"></ion-icon>
                            <span>Copy</span>
                        </button>
                        <button class="action-btn delete-btn" onclick="adminPanel.requestDeleteAccount('${account.id}', '${account.account_id}')"
                                title="Delete Account">
                            <ion-icon name="trash-outline"></ion-icon>
                            <span>Delete</span>
                        </button>
                    </div>
                `;
            } else {
                // Desktop: Full buttons
                actionButtonsHtml = `
                    <div class="action-buttons">
                        <button class="action-btn copy-btn" onclick="adminPanel.requestCopyAccount(${index})">
                            <ion-icon name="copy-outline"></ion-icon>
                            <span>Copy</span>
                        </button>
                        <button class="action-btn delete-btn" onclick="adminPanel.requestDeleteAccount('${account.id}', '${account.account_id}')">
                            <ion-icon name="trash-outline"></ion-icon>
                            <span>Delete</span>
                        </button>
                    </div>
                `;
            }
            
            row.innerHTML = `
                <td class="account-id-cell">
                    <strong>${account.account_id || 'N/A'}</strong>
                </td>
                <td class="uid-cell">
                    ${account.uid || 'N/A'}
                </td>
                <td class="password-cell">
                    ${passwordDisplay}
                </td>
                <td>
                    ${rareTypesHtml}
                </td>
                <td>
                    ${actionButtonsHtml}
                </td>
            `;
            
            // Store account data for copying
            row.dataset.account = JSON.stringify(account);
            tableBody.appendChild(row);
        });
    }
    
    // Request copy account (password protected)
    requestCopyAccount(index) {
        const rows = document.querySelectorAll('#table-body tr');
        if (rows[index]) {
            const account = JSON.parse(rows[index].dataset.account);
            
            this.pendingAction = {
                type: 'copy',
                account: account,
                callback: () => this.showCopyPopup(account)
            };
            
            this.showPasswordPrompt('Copy Account Data');
        }
    }
    
    // Show copy popup with full account data
    showCopyPopup(account) {
        // Format the data as requested: account_id TAB uid TAB password
        this.copyData = `${account.account_id}\t${account.uid}\t${account.password}`;
        
        // Show the formatted data in popup
        document.getElementById('copy-data-preview').innerHTML = `
            <pre>${this.escapeHTML(this.copyData)}</pre>
        `;
        
        // Show copy popup
        document.getElementById('copy-popup').classList.add('show');
    }
    
    // Copy data to clipboard
    async copyDataToClipboard() {
        if (!this.copyData) return;
        
        try {
            await navigator.clipboard.writeText(this.copyData);
            this.showAlert('Account data copied to clipboard!', 'success');
            this.closeCopyPopup();
        } catch (error) {
            console.error('Copy failed:', error);
            this.showAlert('Failed to copy data', 'error');
        }
    }

    closeCopyPopup() {
        document.getElementById('copy-popup').classList.remove('show');
        this.copyData = null;
    }
    
    // Request delete account (password protected)
    requestDeleteAccount(accountId, accountNumber) {
        this.pendingAction = {
            type: 'delete',
            accountId: accountId,
            accountNumber: accountNumber,
            callback: () => this.deleteAccount(accountId)
        };
        
        this.showPasswordPrompt(`Delete Account ${accountNumber}`);
    }
    
    // Delete account (after password verification)
    async deleteAccount(accountId) {
        const { ref, remove } = window.firebaseModules;
        const accountRef = ref(this.database, `accounts/${accountId}`);
        
        try {
            await remove(accountRef);
            this.showAlert('Account deleted successfully', 'success');
        } catch (error) {
            console.error('Delete error:', error);
            this.showAlert('Failed to delete account', 'error');
        }
    }
    
    requestDeleteAllData() {
        this.pendingAction = {
            type: 'delete_all',
            callback: () => this.deleteAllData()
        };
        
        this.showPasswordPrompt('Delete All Data');
    }
    
    async deleteAllData() {
        const { ref, remove } = window.firebaseModules;
        try {
            await remove(this.accountsRef);
            this.showAlert('All data deleted successfully', 'success');
        } catch (error) {
            console.error('Delete all error:', error);
            this.showAlert('Failed to delete all data', 'error');
        }
    }
    
    showPasswordPrompt(actionText) {
        document.getElementById('password-action-text').textContent = `Please enter admin password to ${actionText}`;
        document.getElementById('password-input').value = '';
        document.getElementById('password-popup').classList.add('show');
        document.getElementById('password-input').focus();
    }
    
    verifyPassword() {
        const password = document.getElementById('password-input').value.trim();
        
        if (password === this.ADMIN_PASSWORD) {
            // Password is correct
            this.closePasswordPopup();
            
            if (this.pendingAction) {
                this.pendingAction.callback();
                this.pendingAction = null;
            }
            
            return true;
        } else {
            // Password is incorrect
            this.showAlert('Incorrect password!', 'error');
            document.getElementById('password-input').value = '';
            document.getElementById('password-input').focus();
            return false;
        }
    }
    
    // Close password popup
    closePasswordPopup() {
        document.getElementById('password-popup').classList.remove('show');
        document.getElementById('password-input').value = '';
    }
    
    // Toggle password visibility
    togglePasswordVisibility() {
        const passwordInput = document.getElementById('password-input');
        const toggleBtn = document.getElementById('password-toggle');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleBtn.innerHTML = '<ion-icon name="eye-off-outline"></ion-icon>';
        } else {
            passwordInput.type = 'password';
            toggleBtn.innerHTML = '<ion-icon name="eye-outline"></ion-icon>';
        }
    }
    
    // File upload handling
    setupFileUpload() {
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        const clearFileBtn = document.getElementById('clear-file-btn');
        
        // Click to upload
        uploadArea.addEventListener('click', () => fileInput.click());
        
        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.parentElement.classList.add('drag-over');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.parentElement.classList.remove('drag-over');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.parentElement.classList.remove('drag-over');
            
            if (e.dataTransfer.files.length > 0) {
                this.handleFileSelect(e.dataTransfer.files[0]);
            }
        });
        
        // File input change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });
        
        // Clear file button
        clearFileBtn.addEventListener('click', () => {
            this.clearFile();
        });
    }
    
    // Handle file selection
    handleFileSelect(file) {
        if (!file.name.match(/\.(json|txt)$/i)) {
            this.showAlert('Please select a JSON or TXT file', 'error');
            return;
        }
        
        if (file.size > 10 * 1024 * 1024) {
            this.showAlert('File size must be less than 10MB', 'error');
            return;
        }
        
        this.currentFile = file;
        
        // Update file info
        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-size').textContent = this.formatFileSize(file.size);
        document.getElementById('file-info').classList.add('show');
        
        // Read file to count accounts
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                this.fileAccounts = this.parseJSONFile(content);
                document.getElementById('accounts-found').textContent = this.fileAccounts.length;
                document.getElementById('process-btn').disabled = false;
                this.updateStats();
            } catch (error) {
                this.showAlert('Error reading file: ' + error.message, 'error');
                document.getElementById('process-btn').disabled = true;
            }
        };
        reader.readAsText(file);
    }
    
    // Parse JSON file
    parseJSONFile(content) {
        try {
            const data = JSON.parse(content);
            let accounts = [];
            
            // Handle different JSON structures
            if (Array.isArray(data)) {
                accounts = data;
            } else if (data.accounts && Array.isArray(data.accounts)) {
                accounts = data.accounts;
            } else if (data.users && Array.isArray(data.users)) {
                accounts = data.users;
            } else {
                throw new Error('Invalid JSON structure. Expected array or {accounts: [...]}');
            }
            
            // Validate accounts
            const validAccounts = accounts.filter(acc => {
                if (!acc.account_id || !acc.uid || !acc.password) {
                    console.warn('Invalid account found:', acc);
                    return false;
                }
                return true;
            });
            
            if (validAccounts.length === 0) {
                throw new Error('No valid accounts found in file. Required fields: account_id, uid, password');
            }
            
            return validAccounts;
        } catch (error) {
            throw new Error('Invalid JSON format: ' + error.message);
        }
    }
    
    // Process file and upload to Firebase
    async processFile() {
        if (!this.currentFile || this.fileAccounts.length === 0) {
            this.showAlert('No file selected or no accounts to upload', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target.result;
                this.fileAccounts = this.parseJSONFile(content);
                
                // Show progress
                const progressContainer = document.getElementById('progress-container');
                const progressFill = document.getElementById('progress-fill');
                const progressPercent = document.getElementById('progress-percent');
                const processedCount = document.getElementById('processed-count');
                const totalCount = document.getElementById('total-count');
                const processBtn = document.getElementById('process-btn');
                
                progressContainer.classList.add('show');
                processBtn.disabled = true;
                totalCount.textContent = this.fileAccounts.length;
                
                // Upload accounts to Firebase
                const { ref, push } = window.firebaseModules;
                const totalAccounts = this.fileAccounts.length;
                let uploaded = 0;
                let errors = 0;
                
                for (const account of this.fileAccounts) {
                    try {
                        const newAccountRef = ref(this.database, 'accounts');
                        await push(newAccountRef, {
                            account_id: account.account_id.toString(),
                            uid: account.uid.toString(),
                            password: account.password.toString(),
                            rare_types: account.rare_types || [],
                            created_at: Date.now(),
                            uploaded_at: Date.now()
                        });
                        
                        uploaded++;
                        
                        // Update progress
                        const progress = Math.round((uploaded / totalAccounts) * 100);
                        progressFill.style.width = `${progress}%`;
                        progressPercent.textContent = `${progress}%`;
                        processedCount.textContent = uploaded;
                        
                        // Small delay to avoid overwhelming Firebase
                        await new Promise(resolve => setTimeout(resolve, 50));
                    } catch (error) {
                        console.error('Upload error:', error);
                        errors++;
                    }
                }
                
                // Success
                if (errors === 0) {
                    this.showAlert(`Successfully uploaded ${uploaded} accounts to Firebase`, 'success');
                } else {
                    this.showAlert(`Uploaded ${uploaded} accounts (${errors} errors occurred)`, 'warning');
                }
                
                // Reset file
                setTimeout(() => {
                    progressContainer.classList.remove('show');
                    progressFill.style.width = '0%';
                    progressPercent.textContent = '0%';
                    document.getElementById('file-info').classList.remove('show');
                    processBtn.disabled = true;
                    this.clearFile();
                }, 2000);
                
            } catch (error) {
                this.showAlert('Error processing file: ' + error.message, 'error');
                document.getElementById('progress-container').classList.remove('show');
                document.getElementById('process-btn').disabled = false;
            }
        };
        
        reader.readAsText(this.currentFile);
    }
    
    // Clear file selection
    clearFile() {
        this.currentFile = null;
        this.fileAccounts = [];
        document.getElementById('file-input').value = '';
        document.getElementById('file-info').classList.remove('show');
        document.getElementById('process-btn').disabled = true;
        this.updateStats();
    }
    
    // Search accounts
    searchAccounts() {
        const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
        
        if (!searchTerm) {
            this.filteredAccounts = [...this.allAccounts];
        } else {
            this.filteredAccounts = this.allAccounts.filter(account => 
                (account.account_id && account.account_id.toString().toLowerCase().includes(searchTerm)) ||
                (account.uid && account.uid.toString().toLowerCase().includes(searchTerm)) ||
                (account.password && account.password.toLowerCase().includes(searchTerm)) ||
                (account.rare_types && account.rare_types.some(type => 
                    type.toLowerCase().includes(searchTerm)
                ))
            );
        }
        
        this.currentPage = 1;
        this.renderTable();
    }
    
    // Pagination
    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderTable();
        }
    }
    
    nextPage() {
        const totalPages = Math.ceil(this.filteredAccounts.length / this.rowsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderTable();
        }
    }
    
    // Settings
    toggleSettings() {
        document.getElementById('settings-panel').classList.toggle('open');
    }
    
    updateRowsPerPage() {
        this.rowsPerPage = parseInt(document.getElementById('rows-per-page').value);
        this.currentPage = 1;
        this.renderTable();
        this.saveSettings();
    }
    
    updateAutoRefresh() {
        this.autoRefreshInterval = parseInt(document.getElementById('auto-refresh').value);
        this.setupAutoRefresh();
        this.saveSettings();
    }
    
    updateTableDensity() {
        const density = document.getElementById('table-density').value;
        const table = document.getElementById('data-table');
        
        table.classList.remove('compact', 'normal', 'spacious');
        table.classList.add(density);
        this.saveSettings();
    }
    
    setupAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        if (this.autoRefreshInterval > 0) {
            this.refreshTimer = setInterval(() => {
                this.loadAccounts();
                this.showAlert('Data refreshed automatically', 'info');
            }, this.autoRefreshInterval);
        }
    }
    
    refreshData() {
        this.loadAccounts();
        this.showAlert('Data refreshed manually', 'success');
    }
    
    // Load and save settings
    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('firebaseAdminSettings') || '{}');
        
        this.rowsPerPage = settings.rowsPerPage || 10;
        this.autoRefreshInterval = settings.autoRefreshInterval || 0;
        const density = settings.tableDensity || 'normal';
        
        document.getElementById('rows-per-page').value = this.rowsPerPage;
        document.getElementById('auto-refresh').value = this.autoRefreshInterval;
        document.getElementById('table-density').value = density;
        
        // Apply table density
        const table = document.getElementById('data-table');
        table.classList.add(density);
        
        this.setupAutoRefresh();
    }
    
    saveSettings() {
        const settings = {
            rowsPerPage: this.rowsPerPage,
            autoRefreshInterval: this.autoRefreshInterval,
            tableDensity: document.getElementById('table-density').value
        };
        
        localStorage.setItem('firebaseAdminSettings', JSON.stringify(settings));
    }
    
    // Setup event listeners
    setupEventListeners() {
        // Buttons
        document.getElementById('refresh-btn').addEventListener('click', () => this.refreshData());
        document.getElementById('settings-btn').addEventListener('click', () => this.toggleSettings());
        document.getElementById('close-settings-btn').addEventListener('click', () => this.toggleSettings());
        document.getElementById('process-btn').addEventListener('click', () => this.processFile());
        document.getElementById('prev-btn').addEventListener('click', () => this.previousPage());
        document.getElementById('next-btn').addEventListener('click', () => this.nextPage());
        document.getElementById('clear-all-btn').addEventListener('click', () => this.requestDeleteAllData());
        
        // Password popup
        document.getElementById('password-submit-btn').addEventListener('click', () => this.verifyPassword());
        document.getElementById('password-cancel-btn').addEventListener('click', () => this.closePasswordPopup());
        document.getElementById('password-toggle').addEventListener('click', () => this.togglePasswordVisibility());
        
        // Copy popup
        document.getElementById('copy-confirm-btn').addEventListener('click', () => this.copyDataToClipboard());
        document.getElementById('copy-cancel-btn').addEventListener('click', () => this.closeCopyPopup());
        
        // Settings
        document.getElementById('rows-per-page').addEventListener('change', () => this.updateRowsPerPage());
        document.getElementById('auto-refresh').addEventListener('change', () => this.updateAutoRefresh());
        document.getElementById('table-density').addEventListener('change', () => this.updateTableDensity());
        
        // Search
        document.getElementById('search-input').addEventListener('input', () => this.searchAccounts());
        
        // File upload
        this.setupFileUpload();
        
        // Enter key for password input
        document.getElementById('password-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.verifyPassword();
            }
        });
        
        // Close popups on outside click
        document.getElementById('password-popup').addEventListener('click', (e) => {
            if (e.target.id === 'password-popup') {
                this.closePasswordPopup();
            }
        });
        
        document.getElementById('copy-popup').addEventListener('click', (e) => {
            if (e.target.id === 'copy-popup') {
                this.closeCopyPopup();
            }
        });
    }
    
    // Utility functions
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showAlert(message, type = 'info') {
        const alertDiv = document.getElementById('alert');
        const icon = type === 'success' ? 'checkmark-circle-outline' : 
                    type === 'error' ? 'alert-circle-outline' : 
                    'information-circle-outline';
        
        alertDiv.innerHTML = `
            <ion-icon name="${icon}"></ion-icon>
            <span>${message}</span>
        `;
        alertDiv.className = `alert ${type} show`;
        
        setTimeout(() => {
            alertDiv.classList.remove('show');
        }, 3000);
    }
}

// Initialize the application
let adminPanel;

document.addEventListener('DOMContentLoaded', () => {
    adminPanel = new FirebaseAdminPanel();
});

// Make adminPanel globally available
window.adminPanel = adminPanel;