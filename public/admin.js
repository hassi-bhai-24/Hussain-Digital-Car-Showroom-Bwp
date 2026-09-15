// Admin State
const adminState = {
    token: sessionStorage.getItem('adminToken') || null,
    isDefaultPassword: false,
    cars: [],
    config: {},
    selectedFiles: []
};

// HTML Escaping Utility for XSS Prevention
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Toast Notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-circle-exclamation';
    if (type === 'info') icon = 'fa-circle-info';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Modal helper
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

// Password toggle helper
function togglePassVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    if (btn) {
        btn.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    }
}

// Format PKR Currency
function formatPKR(num) {
    if (!num || isNaN(num)) return 'PKR 0';
    return 'PKR ' + Number(num).toLocaleString('en-PK');
}

// DOM Loaded Entry Point
document.addEventListener('DOMContentLoaded', async () => {
    // Clear any insecure legacy local storage tokens
    try { localStorage.removeItem('adminToken'); } catch {}

    // File input listener for photo uploads
    const fileInput = document.getElementById('formCarFiles');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            adminState.selectedFiles = Array.from(e.target.files);
        });
    }

    // Verify existing session or show login
    if (adminState.token) {
        await verifyExistingSession();
    } else {
        showLoginView();
    }
});

// Verify active JWT session with server
async function verifyExistingSession() {
    try {
        const res = await fetch('/api/admin/verify', {
            headers: { 'Authorization': `Bearer ${adminState.token}` }
        });

        if (res.ok) {
            const data = await res.json();
            adminState.isDefaultPassword = !!data.isDefaultPassword;
            await loadShowroomData();
            showDashboardView();
            return;
        }
    } catch (err) {
        console.warn('Session verification notice:', err.message);
    }

    // Explicitly clear invalid/expired session
    logoutAdmin(false);
}

// Load Inventory and Config from Server API
async function loadShowroomData() {
    try {
        const res = await fetch('/api/public/data', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            adminState.cars = data.cars || [];
            adminState.config = data.config || {};
            
            // Update admin header brand name
            const brandEl = document.getElementById('adminHeaderBrand');
            if (brandEl && adminState.config.showroomName) {
                brandEl.textContent = `${adminState.config.showroomName.toUpperCase()} ADMIN`;
            }
            const subtitleEl = document.getElementById('adminShowroomSubtitle');
            if (subtitleEl && adminState.config.showroomName) {
                subtitleEl.textContent = `Managing inventory, prices, and settings for ${adminState.config.showroomName}`;
            }

            updateAdminStats();
            renderAdminTable();
            populateConfigForm();
        }
    } catch (err) {
        console.error('Failed to load showroom data:', err);
    }
}

// Show / Hide Views
function showLoginView() {
    document.getElementById('adminLoginView')?.classList.remove('hidden');
    document.getElementById('adminDashboardView')?.classList.add('hidden');
    document.getElementById('btnTopLogout')?.classList.add('hidden');
    const feedback = document.getElementById('adminLoginFeedback');
    if (feedback) feedback.className = 'alert-box hidden';
}

function showDashboardView() {
    document.getElementById('adminLoginView')?.classList.add('hidden');
    document.getElementById('adminDashboardView')?.classList.remove('hidden');
    document.getElementById('btnTopLogout')?.classList.remove('hidden');

    const warning = document.getElementById('defaultPasswordWarning');
    if (warning) {
        warning.classList.toggle('hidden', !adminState.isDefaultPassword);
    }
}

// Login Handler - STRICT SERVER VERIFICATION ONLY
async function handleAdminLogin(e) {
    e.preventDefault();
    const userField = document.getElementById('adminUser');
    const username = userField ? userField.value.trim() : '';
    const password = document.getElementById('adminPass').value.trim();
    const btn = document.getElementById('adminLoginBtn');
    const feedback = document.getElementById('adminLoginFeedback');

    if (feedback) {
        feedback.className = 'alert-box alert-error hidden';
        feedback.textContent = '';
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';
    }

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data || !data.token) {
            throw new Error((data && data.error) || 'Invalid master credentials or server authentication error.');
        }

        // Successfully authenticated by server
        adminState.token = data.token;
        adminState.isDefaultPassword = !!data.isDefaultPassword;
        sessionStorage.setItem('adminToken', data.token);

        showToast('Password verified. Admin dashboard unlocked.', 'success');
        await loadShowroomData();
        showDashboardView();
    } catch (err) {
        if (feedback) {
            feedback.className = 'alert-box alert-error';
            feedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <div><strong>Access Denied:</strong> ${escapeHTML(err.message)}</div>`;
        }
        showToast(err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Access Admin Panel';
        }
    }
}

// Sign out
function logoutAdmin(notify = true) {
    adminState.token = null;
    sessionStorage.removeItem('adminToken');
    try { localStorage.removeItem('adminToken'); } catch {}
    
    if (notify) {
        showToast('Admin panel locked. Signed out successfully.', 'info');
    }
    showLoginView();
}

// Tab Switching
function switchAdminTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(tabId)?.classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`)?.classList.add('active');
}

// Stats Calculation
function updateAdminStats() {
    const total = adminState.cars.length;
    const available = adminState.cars.filter(c => c.status === 'available').length;
    const pending = adminState.cars.filter(c => c.status === 'pending').length;
    const totalVal = adminState.cars.reduce((sum, c) => sum + (c.cashPrice || 0), 0);

    const totalEl = document.getElementById('statTotalCars');
    const availEl = document.getElementById('statAvailableCars');
    const pendEl = document.getElementById('statPendingCars');
    const valEl = document.getElementById('statTotalValue');
    const tabCount = document.getElementById('tabCountVehicles');

    if (totalEl) totalEl.textContent = total;
    if (availEl) availEl.textContent = available;
    if (pendEl) pendEl.textContent = pending;
    if (valEl) valEl.textContent = formatPKR(totalVal);
    if (tabCount) tabCount.textContent = total;
}

// Filter Admin Table
function filterAdminTable() {
    const q = (document.getElementById('adminTableSearch')?.value || '').toLowerCase().trim();
    renderAdminTable(q);
}

// Render Admin Vehicles Table
function renderAdminTable(searchQuery = '') {
    const tbody = document.getElementById('adminCarTableBody');
    if (!tbody) return;

    let cars = adminState.cars;
    if (searchQuery) {
        cars = cars.filter(c => 
            (c.name && c.name.toLowerCase().includes(searchQuery)) ||
            (c.year && String(c.year).includes(searchQuery)) ||
            (c.specs && c.specs.toLowerCase().includes(searchQuery))
        );
    }

    if (!cars.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2.5rem; color: var(--text-secondary);">
                    <i class="fa-solid fa-car-tunnel" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.5;"></i>
                    No vehicles found matching your query.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = cars.map(car => {
        const thumb = (car.images && car.images[0]) || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=300&q=80';
        const safeName = escapeHTML(car.name || 'Unnamed Vehicle');
        const safeYear = escapeHTML(car.year || 'N/A');
        const safeMileage = escapeHTML(car.mileage || 'N/A');
        const priceFmt = formatPKR(car.cashPrice);
        const installmentInfo = car.installmentAvailable 
            ? `<span class="badge-installment"><i class="fa-solid fa-calendar-check"></i> ${escapeHTML(car.installmentPlan || 'Plan Available')}</span>` 
            : '<span style="color: var(--text-secondary); font-size: 0.8rem;">Cash Only</span>';

        return `
            <tr>
                <td>
                    <div class="admin-car-row">
                        <img src="${encodeURI(thumb)}" alt="${safeName}" class="admin-car-thumb" onerror="this.src='https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=300&q=80'">
                        <div class="admin-car-info">
                            <strong>${safeName}</strong>
                            <small>${safeYear} • ${safeMileage}</small>
                        </div>
                    </div>
                </td>
                <td style="font-weight: 700; color: var(--accent-lime); font-family: var(--font-display);">${priceFmt}</td>
                <td>
                    <select class="status-badge status-${car.status}" style="background-color: var(--surface-dark); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; padding: 0.25rem 0.5rem; cursor: pointer; font-size: 0.8rem;" onchange="quickUpdateStatus('${car.id}', this.value)">
                        <option value="available" ${car.status === 'available' ? 'selected' : ''}>🟢 Available</option>
                        <option value="pending" ${car.status === 'pending' ? 'selected' : ''}>🟠 Sale in Progress</option>
                        <option value="sold" ${car.status === 'sold' ? 'selected' : ''}>🔴 Sold</option>
                    </select>
                </td>
                <td>${installmentInfo}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-action-icon" onclick="openEditCarModal('${car.id}')" title="Edit Vehicle Details & Pricing">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-action-icon text-danger" onclick="openDeleteConfirmModal('${car.id}', '${safeName}')" title="Permanently Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Quick Status Switch
async function quickUpdateStatus(carId, newStatus) {
    try {
        const res = await fetch(`/api/admin/cars/${carId}/status`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${adminState.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to update vehicle status on server.');
        }

        const car = adminState.cars.find(c => c.id === carId);
        if (car) {
            car.status = newStatus;
            updateAdminStats();
            renderAdminTable();
        }

        showToast(`Vehicle marked as ${newStatus}`, 'success');
        await loadShowroomData();
    } catch (err) {
        showToast(err.message, 'error');
        renderAdminTable();
    }
}

// Toggle installment input display in form
function toggleInstallmentInputs() {
    const isChecked = document.getElementById('formCarInstallmentCheck')?.checked;
    const group = document.getElementById('installmentDetailsGroup');
    if (group) {
        group.classList.toggle('hidden', !isChecked);
    }
}

// Prepare form for editing an existing car
function openEditCarModal(carId) {
    const car = adminState.cars.find(c => c.id === carId);
    if (!car) return;

    document.getElementById('carFormEditId').value = car.id;
    document.getElementById('carFormHeading').textContent = `Edit Vehicle: ${car.name}`;
    document.getElementById('btnCancelEdit').classList.remove('hidden');
    document.getElementById('carFormSubmitBtn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Vehicle Details';

    document.getElementById('formCarName').value = car.name || '';
    document.getElementById('formCarYear').value = car.year || '';
    document.getElementById('formCarMileage').value = car.mileage || '';
    document.getElementById('formCarPrice').value = car.cashPrice || '';
    document.getElementById('formCarSpecs').value = car.specs || '';
    document.getElementById('formCarStatus').value = car.status || 'available';

    const instCheck = document.getElementById('formCarInstallmentCheck');
    if (instCheck) {
        instCheck.checked = !!car.installmentAvailable;
        toggleInstallmentInputs();
    }
    document.getElementById('formCarInstallmentPlan').value = car.installmentPlan || '';

    // If external images exist
    const extImgs = (car.images || []).filter(img => img.startsWith('http'));
    document.getElementById('formCarImageUrls').value = extImgs.join(', ');

    // Clear file selection
    const fileInput = document.getElementById('formCarFiles');
    if (fileInput) fileInput.value = '';
    adminState.selectedFiles = [];

    switchAdminTab('addCarTab');
    document.getElementById('addTabLabel').textContent = 'Edit Vehicle';
    document.getElementById('carFormFeedback').className = 'alert-box hidden';
}

// Reset form for adding a new car
function startNewCarForm() {
    document.getElementById('carForm').reset();
    document.getElementById('carFormEditId').value = '';
    document.getElementById('carFormHeading').textContent = 'Add New Vehicle to Showroom';
    document.getElementById('btnCancelEdit').classList.add('hidden');
    document.getElementById('carFormSubmitBtn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Vehicle to Inventory';
    document.getElementById('addTabLabel').textContent = 'Add Vehicle';
    toggleInstallmentInputs();

    const fileInput = document.getElementById('formCarFiles');
    if (fileInput) fileInput.value = '';
    adminState.selectedFiles = [];

    const feedback = document.getElementById('carFormFeedback');
    if (feedback) feedback.className = 'alert-box hidden';

    switchAdminTab('addCarTab');
}

// Add / Edit Car Form Submission
async function handleCarFormSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('carFormEditId').value;
    const btn = document.getElementById('carFormSubmitBtn');
    const feedback = document.getElementById('carFormFeedback');

    const formName = document.getElementById('formCarName').value.trim();
    const formYear = document.getElementById('formCarYear').value.trim();
    const formMileage = document.getElementById('formCarMileage').value.trim();
    const formPrice = parseFloat(document.getElementById('formCarPrice').value) || 0;
    const formSpecs = document.getElementById('formCarSpecs').value.trim();
    const formStatus = document.getElementById('formCarStatus').value;
    const formInstCheck = document.getElementById('formCarInstallmentCheck').checked;
    const formInstPlan = document.getElementById('formCarInstallmentPlan').value.trim();
    const rawUrls = document.getElementById('formCarImageUrls').value;

    const extImgs = rawUrls.split(/[,\n]+/).map(s => s.trim()).filter(s => s.startsWith('http://') || s.startsWith('https://'));

    const formData = new FormData();
    formData.append('name', formName);
    formData.append('year', formYear);
    formData.append('mileage', formMileage);
    formData.append('cashPrice', formPrice);
    formData.append('specs', formSpecs);
    formData.append('status', formStatus);
    formData.append('installmentAvailable', formInstCheck);
    formData.append('installmentPlan', formInstPlan);

    extImgs.forEach(u => formData.append('externalImages', u));
    
    // Add uploaded files
    const fileInput = document.getElementById('formCarFiles');
    if (fileInput && fileInput.files) {
        for (let i = 0; i < fileInput.files.length; i++) {
            formData.append('images', fileInput.files[i]);
        }
    }

    const url = editId ? `/api/admin/cars/${editId}` : '/api/admin/cars';
    const method = editId ? 'PUT' : 'POST';

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving securely to cloud...';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Authorization': `Bearer ${adminState.token}` },
            body: formData
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            throw new Error((data && data.error) || 'Failed to save vehicle to server.');
        }

        showToast(editId ? 'Vehicle updated successfully!' : 'Vehicle added to showroom inventory!', 'success');
        startNewCarForm();
        switchAdminTab('inventoryTab');

        // Immediately refresh state directly from the server API
        await loadShowroomData();
    } catch (err) {
        if (feedback) {
            feedback.className = 'alert-box alert-error';
            feedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${escapeHTML(err.message)}</span>`;
        }
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = editId ? '<i class="fa-solid fa-floppy-disk"></i> Update Vehicle Details' : '<i class="fa-solid fa-floppy-disk"></i> Save Vehicle to Inventory';
    }
}

// Modal for deletion
function openDeleteConfirmModal(carId, carName) {
    document.getElementById('deleteVehicleId').value = carId;
    document.getElementById('deleteVehicleName').textContent = carName;
    openModal('confirmDeleteModal');
}

// Execute Delete on Server
async function confirmExecuteDelete() {
    const carId = document.getElementById('deleteVehicleId').value;
    closeModal('confirmDeleteModal');

    try {
        const res = await fetch(`/api/admin/cars/${carId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminState.token}` }
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to delete vehicle from server.');
        }

        showToast('Vehicle removed from showroom inventory.', 'success');
        await loadShowroomData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Populate Showroom Configuration Form
function populateConfigForm() {
    const { showroomName, whatsappNumber, adminPhoneDisplay, address, description } = adminState.config;
    const nameInput = document.getElementById('configShowroomName');
    const waInput = document.getElementById('configWhatsapp');
    const addrInput = document.getElementById('configAddress');
    const descInput = document.getElementById('configDescription');

    if (nameInput) nameInput.value = showroomName || 'HUSSAIN Digital Showroom';
    if (waInput) waInput.value = adminPhoneDisplay || whatsappNumber || '03238194402';
    if (addrInput) addrInput.value = address || 'Hussain digital Showroom, Bwp.';
    if (descInput) descInput.value = description || '';
}

// Submit Showroom Settings
async function handleConfigSubmit(e) {
    e.preventDefault();
    const feedback = document.getElementById('configFeedback');
    const configData = {
        showroomName: document.getElementById('configShowroomName').value.trim(),
        whatsappNumber: document.getElementById('configWhatsapp').value.trim(),
        address: document.getElementById('configAddress').value.trim(),
        description: document.getElementById('configDescription').value.trim()
    };

    try {
        const res = await fetch('/api/admin/config', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${adminState.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(configData)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to update configuration on server.');
        }

        if (feedback) {
            feedback.className = 'alert-box alert-success';
            feedback.innerHTML = '<i class="fa-solid fa-check"></i> <span>Showroom settings updated successfully.</span>';
        }
        showToast('Showroom settings updated successfully!', 'success');
        await loadShowroomData();
    } catch (err) {
        if (feedback) {
            feedback.className = 'alert-box alert-error';
            feedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${escapeHTML(err.message)}</span>`;
        }
        showToast(err.message, 'error');
    }
}

// Test current WhatsApp configuration
function testWhatsAppConfiguration() {
    const raw = document.getElementById('configWhatsapp').value.trim();
    const cleanNumber = raw.replace(/\D/g, '');
    const intlNumber = cleanNumber.startsWith('0') ? '92' + cleanNumber.substring(1) : (cleanNumber.startsWith('92') ? cleanNumber : '92' + cleanNumber);
    const testUrl = `https://wa.me/${intlNumber}?text=${encodeURIComponent('Hello Admin! Testing WhatsApp inquiry link for HUSSAIN Digital Showroom.')}`;
    showToast(`Opening test WhatsApp chat (${intlNumber})...`, 'info');
    window.open(testUrl, '_blank');
}

// Submit Change Master Password
async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const feedback = document.getElementById('securityFeedback');
    const currentPassword = document.getElementById('secCurrentPassword').value.trim();
    const newUsername = document.getElementById('secNewUsername').value.trim();
    const newPassword = document.getElementById('secNewPassword').value.trim();
    const confirmPassword = document.getElementById('secConfirmPassword').value.trim();

    if (feedback) {
        feedback.className = 'alert-box hidden';
        feedback.textContent = '';
    }

    if (!newPassword || newPassword.length < 8) {
        const msg = 'New password must be at least 8 characters long.';
        if (feedback) {
            feedback.className = 'alert-box alert-error';
            feedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${msg}</span>`;
        }
        showToast(msg, 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        const msg = 'New password and confirmation do not match.';
        if (feedback) {
            feedback.className = 'alert-box alert-error';
            feedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${msg}</span>`;
        }
        showToast(msg, 'error');
        return;
    }

    try {
        const res = await fetch('/api/admin/change-password', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${adminState.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPassword, newUsername, newPassword })
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            throw new Error((data && data.error) || 'Failed to update credentials on server.');
        }

        if (data && data.refreshedToken) {
            adminState.token = data.refreshedToken;
            sessionStorage.setItem('adminToken', data.refreshedToken);
        }

        adminState.isDefaultPassword = false;
        const warning = document.getElementById('defaultPasswordWarning');
        if (warning) warning.classList.add('hidden');

        document.getElementById('secCurrentPassword').value = '';
        document.getElementById('secNewPassword').value = '';
        document.getElementById('secConfirmPassword').value = '';

        if (feedback) {
            feedback.className = 'alert-box alert-success';
            feedback.innerHTML = `<i class="fa-solid fa-check"></i> <span>${escapeHTML(data.message || 'Master password updated successfully.')}</span>`;
        }
        showToast('Master password updated successfully.', 'success');
        document.getElementById('securityForm').reset();
    } catch (err) {
        if (feedback) {
            feedback.className = 'alert-box alert-error';
            feedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${escapeHTML(err.message)}</span>`;
        }
        showToast(err.message, 'error');
    }
}
