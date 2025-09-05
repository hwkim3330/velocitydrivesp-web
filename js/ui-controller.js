// UI Controller for managing interface interactions
export class UIController {
    constructor() {
        this.statusTimeout = null;
        this.notifications = [];
        this.maxNotifications = 5;
    }
    
    // Update status message
    updateStatus(message, type = 'info', duration = 3000) {
        const statusElement = document.getElementById('statusMessage');
        if (!statusElement) return;
        
        statusElement.textContent = message;
        statusElement.className = `status-${type}`;
        
        // Clear existing timeout
        if (this.statusTimeout) {
            clearTimeout(this.statusTimeout);
        }
        
        // Auto-clear status after duration (except for errors)
        if (type !== 'error' && duration > 0) {
            this.statusTimeout = setTimeout(() => {
                statusElement.textContent = 'Ready';
                statusElement.className = '';
            }, duration);
        }
    }
    
    // Show error dialog
    showError(message, title = 'Error') {
        this.showModal(title, message, 'error');
        this.updateStatus(message, 'error', 0); // Don't auto-clear errors
    }
    
    // Show success message
    showSuccess(message, title = 'Success') {
        this.showNotification(message, 'success');
        this.updateStatus(message, 'success');
    }
    
    // Show warning message
    showWarning(message, title = 'Warning') {
        this.showNotification(message, 'warning');
        this.updateStatus(message, 'warning');
    }
    
    // Show info message
    showInfo(message, title = 'Information') {
        this.showNotification(message, 'info');
        this.updateStatus(message, 'info');
    }
    
    // Show modal dialog
    showModal(title, content, type = 'info') {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalConfirm = document.getElementById('modalConfirm');
        const modalCancel = document.getElementById('modalCancel');
        
        if (!modal) return;
        
        modalTitle.textContent = title;
        modalBody.innerHTML = typeof content === 'string' ? `<p>${content}</p>` : content;
        
        // Style modal based on type
        modal.className = `modal active modal-${type}`;
        
        // Show/hide buttons based on type
        if (type === 'error' || type === 'info') {
            modalCancel.style.display = 'none';
            modalConfirm.textContent = 'OK';
        } else {
            modalCancel.style.display = 'inline-block';
            modalConfirm.textContent = 'Confirm';
        }
        
        modal.style.display = 'flex';
        
        return new Promise((resolve) => {
            const handleConfirm = () => {
                modal.style.display = 'none';
                modal.classList.remove('active');
                modalConfirm.removeEventListener('click', handleConfirm);
                modalCancel.removeEventListener('click', handleCancel);
                resolve(true);
            };
            
            const handleCancel = () => {
                modal.style.display = 'none';
                modal.classList.remove('active');
                modalConfirm.removeEventListener('click', handleConfirm);
                modalCancel.removeEventListener('click', handleCancel);
                resolve(false);
            };
            
            modalConfirm.addEventListener('click', handleConfirm);
            modalCancel.addEventListener('click', handleCancel);
            
            // Close on backdrop click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    handleCancel();
                }
            });
            
            // Close on escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    handleCancel();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }
    
    // Show toast notification
    showNotification(message, type = 'info', duration = 4000) {
        // Create notification container if it doesn't exist
        let container = document.getElementById('notifications');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notifications';
            container.className = 'notifications-container';
            document.body.appendChild(container);
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        // Get icon based on type
        const icons = {
            success: 'check_circle',
            error: 'error',
            warning: 'warning',
            info: 'info'
        };
        
        notification.innerHTML = `
            <span class="material-icons">${icons[type] || 'info'}</span>
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        `;
        
        // Add to container
        container.appendChild(notification);
        
        // Limit number of notifications
        while (container.children.length > this.maxNotifications) {
            container.removeChild(container.firstChild);
        }
        
        // Auto-remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                container.removeChild(notification);
            }
        }, duration);
        
        // Manual close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            if (notification.parentNode) {
                container.removeChild(notification);
            }
        });
    }
    
    // Show loading spinner
    showLoading(message = 'Loading...') {
        let loader = document.getElementById('loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'loader';
            loader.className = 'loader-overlay';
            document.body.appendChild(loader);
        }
        
        loader.innerHTML = `
            <div class="loader-content">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
        
        loader.style.display = 'flex';
    }
    
    // Hide loading spinner
    hideLoading() {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }
    
    // Progress bar
    showProgress(percentage, message = '') {
        let progressBar = document.getElementById('progressBar');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.id = 'progressBar';
            progressBar.className = 'progress-bar-container';
            document.body.appendChild(progressBar);
        }
        
        progressBar.innerHTML = `
            <div class="progress-bar-content">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
                <p>${message}</p>
                <span>${percentage}%</span>
            </div>
        `;
        
        progressBar.style.display = 'block';
        
        // Auto-hide when complete
        if (percentage >= 100) {
            setTimeout(() => {
                progressBar.style.display = 'none';
            }, 1000);
        }
    }
    
    // Form validation helpers
    validateForm(formElement) {
        const errors = [];
        const inputs = formElement.querySelectorAll('input[required], select[required], textarea[required]');
        
        inputs.forEach(input => {
            if (!input.value.trim()) {
                errors.push(`${input.name || input.id || 'Field'} is required`);
                input.classList.add('error');
            } else {
                input.classList.remove('error');
            }
            
            // Type-specific validation
            if (input.type === 'email' && input.value && !this.isValidEmail(input.value)) {
                errors.push('Please enter a valid email address');
                input.classList.add('error');
            }
            
            if (input.type === 'number') {
                const min = input.getAttribute('min');
                const max = input.getAttribute('max');
                const value = parseFloat(input.value);
                
                if (min && value < parseFloat(min)) {
                    errors.push(`${input.name || input.id} must be at least ${min}`);
                    input.classList.add('error');
                }
                
                if (max && value > parseFloat(max)) {
                    errors.push(`${input.name || input.id} must be at most ${max}`);
                    input.classList.add('error');
                }
            }
        });
        
        if (errors.length > 0) {
            this.showError(errors.join('\n'));
            return false;
        }
        
        return true;
    }
    
    // Helper functions
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    // Debounce function for input handlers
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Throttle function for scroll/resize handlers
    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    // Copy to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showSuccess('Copied to clipboard');
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showSuccess('Copied to clipboard');
        }
    }
    
    // Download file
    downloadFile(content, filename, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showSuccess(`Downloaded ${filename}`);
    }
}