// ===== GLOBAL VARIABLES =====
const sensorElements = {
    nitrogen: document.getElementById('nitrogen-value'),
    phosphorus: document.getElementById('phosphorus-value'),
    potassium: document.getElementById('potassium-value'),
    conductivity: document.getElementById('conductivity-value'),
    ph: document.getElementById('ph-value'),
    moisture: document.getElementById('moisture-value'),
    temperature: document.getElementById('temperature-value'),
    weight: document.getElementById('weight-value'),
    level: document.getElementById('tank-level-value')
};

let currentDeviceId = null;
let database = null;
let app = null;
let pumpStatusListener = null;
let currentDeviceData = null;

// ===== HELPER FUNCTIONS =====
function getElement(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`⚠️ Element with id "${id}" not found`);
    }
    return el;
}

// ===== FIREBASE FUNCTIONS =====
function initializeFirebase() {
    try {
        app = firebase.initializeApp(window.firebaseConfig);
        database = firebase.database();
        console.log("✅ Firebase initialized");
        return true;
    } catch (error) {
        console.error("❌ Firebase initialization failed:", error);
        showNotification("⚠️ Firebase connection failed", "error");
        return false;
    }
}

function loadFirebaseDevice() {
    const deviceId = document.getElementById('deviceIdInput').value.trim();
    
    if (!deviceId) {
        showNotification("⚠️ Please enter a device ID", "warning");
        return;
    }
    
    console.log(`📡 Loading device: ${deviceId}`);
    showNotification(`🔍 Searching for ${deviceId}...`, "info");
    
    if (!database) {
        if (!initializeFirebase()) return;
    }
    
    database.ref('devices/' + deviceId).once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                const deviceData = snapshot.val();
                currentDeviceId = deviceId;
                currentDeviceData = deviceData;
                
                history.pushState({}, '', `?device=${deviceId}`);
                
                // Hide input, show device info
                const inputSection = getElement('firebaseInputSection');
                const deviceInfo = getElement('deviceInfoHeader');
                const dashboard = getElement('sensorDashboard');
                const pumpPage = getElement('pumpControlPage');
                
                if (inputSection) inputSection.style.display = 'none';
                if (deviceInfo) deviceInfo.style.display = 'block';
                if (dashboard) dashboard.style.display = 'none';
                if (pumpPage) pumpPage.style.display = 'none';
                
                // Update device info display
                const deviceNameDisplay = getElement('deviceNameDisplay');
                const deviceIdDisplay = getElement('deviceIdDisplay');
                
                if (deviceNameDisplay) {
                    deviceNameDisplay.textContent = deviceData.info?.name || deviceId.toUpperCase();
                }
                if (deviceIdDisplay) {
                    deviceIdDisplay.textContent = deviceId;
                }
                
                // Add action buttons
                addDashboardButton(deviceData);
                
                showNotification(`✅ Connected to ${deviceId}`, "success");
            } else {
                showNotification(`❌ Device "${deviceId}" not found`, "error");
            }
        })
        .catch((error) => {
            console.error("Firebase error:", error);
            showNotification(`⚠️ Error: ${error.message}`, "error");
        });
}

function updateFirebaseValues(sensorData) {
    console.log("Updating with Firebase data:", sensorData);
    
    if (sensorElements.nitrogen) {
        sensorElements.nitrogen.textContent = sensorData.nitrogen ? sensorData.nitrogen.toFixed(2) : "--";
    }
    if (sensorElements.phosphorus) {
        sensorElements.phosphorus.textContent = sensorData.phosphorous ? sensorData.phosphorous.toFixed(2) : "--";
    }
    if (sensorElements.potassium) {
        sensorElements.potassium.textContent = sensorData.potassium ? sensorData.potassium.toFixed(2) : "--";
    }
    if (sensorElements.conductivity) {
        sensorElements.conductivity.textContent = sensorData.ec ? sensorData.ec.toFixed(2) : "--";
    }
    if (sensorElements.ph) {
        sensorElements.ph.textContent = sensorData.ph ? sensorData.ph.toFixed(2) : "--";
    }
    if (sensorElements.moisture) {
        sensorElements.moisture.textContent = sensorData.moisture ? sensorData.moisture.toFixed(2) : "--";
    }
    if (sensorElements.temperature) {
        sensorElements.temperature.textContent = sensorData.temperature ? sensorData.temperature.toFixed(2) : "--";
    }
    if (sensorElements.weight) {
        sensorElements.weight.textContent = sensorData.weight ? sensorData.weight.toFixed(2) : "--";
    }
    if (sensorElements.level) {
        sensorElements.level.textContent = sensorData.level ? sensorData.level.toFixed(2) : "--";
    }
}

function startFirebaseUpdates(deviceId) {
    if (!database) return;
    
    database.ref('devices/' + deviceId + '/data').on('value', (snapshot) => {
        const newData = snapshot.val();
        if (newData) {
            updateFirebaseValues(newData);
            console.log("📡 Real-time update received");
        }
    });
}

function changeFirebaseDevice() {
    console.log("🔄 Changing device...");
    
    if (currentDeviceId && database) {
        database.ref('devices/' + currentDeviceId + '/data').off();
        if (pumpStatusListener) {
            database.ref('devices/' + currentDeviceId + '/pump').off();
            pumpStatusListener = null;
        }
    }
    
    currentDeviceId = null;
    currentDeviceData = null;
    
    // Hide everything, show input section
    const pumpPage = getElement('pumpControlPage');
    const deviceInfo = getElement('deviceInfoHeader');
    const dashboard = getElement('sensorDashboard');
    const inputSection = getElement('firebaseInputSection');
    
    if (pumpPage) pumpPage.style.display = 'none';
    if (deviceInfo) deviceInfo.style.display = 'none';
    if (dashboard) dashboard.style.display = 'none';
    if (inputSection) inputSection.style.display = 'block';
    
    // Clear input
    const deviceInput = getElement('deviceIdInput');
    if (deviceInput) {
        deviceInput.value = '';
        deviceInput.focus();
    }
    
    // Clear sensor values
    Object.values(sensorElements).forEach(el => {
        if (el) el.textContent = "--";
    });
    
    history.pushState({}, '', window.location.pathname);
    console.log("✅ Reset complete, ready for new device");
}

// ===== DEVICE ACTION BUTTONS =====
function addDashboardButton(deviceData) {
    const deviceActionsContainer = getElement('deviceActionsContainer');
    if (!deviceActionsContainer) return;
    
    // Clear any existing buttons
    deviceActionsContainer.innerHTML = '';
    
    // Create "View Dashboard" button
    const dashboardBtn = document.createElement('button');
    dashboardBtn.className = 'device-action-btn';
    dashboardBtn.innerHTML = '📊 View Sensor Dashboard';
    dashboardBtn.onclick = () => {
        showSensorDashboard(deviceData);
    };
    
    // Create "Control Pumps" button
    const pumpBtn = document.createElement('button');
    pumpBtn.className = 'device-action-btn secondary';
    pumpBtn.innerHTML = '🚰 Control Pumps';
    pumpBtn.onclick = () => {
        showPumpControlPage(deviceData);
    };
    
    // Add buttons
    deviceActionsContainer.appendChild(dashboardBtn);
    deviceActionsContainer.appendChild(pumpBtn);
}

// ===== PAGE NAVIGATION FUNCTIONS =====
function showSensorDashboard(deviceData) {
    console.log("📊 Showing sensor dashboard");
    
    // Hide device info, show dashboard
    const deviceInfo = getElement('deviceInfoHeader');
    const dashboard = getElement('sensorDashboard');
    
    if (deviceInfo) deviceInfo.style.display = 'none';
    if (dashboard) {
        dashboard.style.display = 'block';
        
        // Update sensor values
        updateFirebaseValues(deviceData.data || {});
        
        // Start real-time updates
        startFirebaseUpdates(currentDeviceId);
    }
}

function goBackToDeviceInfo() {
    console.log("🔙 Going back to device info");
    
    // Hide dashboard, show device info
    const dashboard = getElement('sensorDashboard');
    const deviceInfo = getElement('deviceInfoHeader');
    
    if (dashboard) dashboard.style.display = 'none';
    if (deviceInfo) deviceInfo.style.display = 'block';
}

// ===== PUMP CONTROL FUNCTIONS =====
function showPumpControlPage(deviceData) {
    console.log("🎛️ Showing pump control page");
    
    // Hide device info, show pump page
    const deviceInfo = getElement('deviceInfoHeader');
    const pumpPage = getElement('pumpControlPage');
    
    if (deviceInfo) deviceInfo.style.display = 'none';
    if (pumpPage) {
        pumpPage.style.display = 'block';
        
        // Update device name on pump page
        const pumpDeviceName = getElement('pumpDeviceName');
        if (pumpDeviceName) {
            pumpDeviceName.textContent = deviceData.info?.name || currentDeviceId.toUpperCase();
        }
        
        // Start listening to pump status
        startPumpStatusUpdates(currentDeviceId);
        loadCurrentPumpStatus(currentDeviceId);
    }
}

function goBackToDeviceInfoFromPump() {  
    console.log("🔙 Going back to device info from pump");
    
    // Hide pump page
    const pumpPage = getElement('pumpControlPage');
    if (pumpPage) pumpPage.style.display = 'none';
    
    // Show DEVICE INFO (not dashboard)
    const deviceInfo = getElement('deviceInfoHeader');
    if (deviceInfo) deviceInfo.style.display = 'block';
    
    // Hide dashboard just in case
    const dashboard = getElement('sensorDashboard');
    if (dashboard) dashboard.style.display = 'none';
    
    // Stop pump status updates
    if (pumpStatusListener && database && currentDeviceId) {
        database.ref('devices/' + currentDeviceId + '/pump').off();
        pumpStatusListener = null;
    }
}

function loadCurrentPumpStatus(deviceId) {
    if (!database) return;
    
    database.ref('devices/' + deviceId + '/pump').once('value')
        .then((snapshot) => {
            const pumpData = snapshot.val();
            if (pumpData) {
                updatePumpDisplay('water', pumpData.water || 0);
                updatePumpDisplay('fertilizer', pumpData.fertilizer || 0);
            }
        })
        .catch((error) => {
            console.error("Error loading pump status:", error);
        });
}

function startPumpStatusUpdates(deviceId) {
    if (!database) return;
    
    pumpStatusListener = database.ref('devices/' + deviceId + '/pump')
        .on('value', (snapshot) => {
            const pumpData = snapshot.val();
            if (pumpData) {
                updatePumpDisplay('water', pumpData.water || 0);
                updatePumpDisplay('fertilizer', pumpData.fertilizer || 0);
            }
        });
}

function controlPump(pumpType, state) {
    if (!currentDeviceId || !database) {
        showNotification("⚠️ Not connected to device", "error");
        return;
    }
    
    const command = state === 1 ? "ON" : "OFF";
    const updates = {};
    updates[`devices/${currentDeviceId}/pump/${pumpType}`] = state;
    
    database.ref().update(updates)
        .then(() => {
            showNotification(`✅ ${pumpType.toUpperCase()} pump turned ${command}`, "success");
        })
        .catch((error) => {
            console.error("Error controlling pump:", error);
            showNotification(`❌ Failed to control pump: ${error.message}`, "error");
        });
}

function updatePumpDisplay(pumpType, state) {
    const statusElement = getElement(`${pumpType}PumpStatus`);
    const onButton = getElement(`${pumpType}OnBtn`);
    const offButton = getElement(`${pumpType}OffBtn`);
    const summaryElement = getElement(`summary${pumpType.charAt(0).toUpperCase() + pumpType.slice(1)}`);
    
    if (!statusElement) return;
    
    if (state === 1) {
        // Pump is ON
        statusElement.textContent = "ON";
        statusElement.className = "status-on";
        
        if (onButton) onButton.classList.add('active');
        if (offButton) offButton.classList.remove('active');

    } else {
        // Pump is OFF
        statusElement.textContent = "OFF";
        statusElement.className = "status-off";
        
        if (onButton) onButton.classList.remove('active');
        if (offButton) offButton.classList.add('active');

    }
}


// ===== UI HELPER FUNCTIONS =====
function showNotification(message, type = 'info') {
    const existing = getElement('serverNotification');
    if (existing) existing.remove();
    
    const colors = {
        success: '#4CAF50',
        error: '#f44336',
        warning: '#FF9800',
        info: '#2196F3'
    };
    
    const notification = document.createElement('div');
    notification.id = 'serverNotification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: ${colors[type] || '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        font-weight: bold;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
        word-wrap: break-word;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== INITIALIZATION =====
function initializeApp() {
    console.log("🌱 EET Agri IOT App Initializing...");
    
    // Initialize with all pages hidden except input
    const pumpPage = getElement('pumpControlPage');
    const deviceInfo = getElement('deviceInfoHeader');
    const dashboard = getElement('sensorDashboard');
    const inputSection = getElement('firebaseInputSection');
    
    if (pumpPage) pumpPage.style.display = 'none';
    if (deviceInfo) deviceInfo.style.display = 'none';
    if (dashboard) dashboard.style.display = 'none';
    if (inputSection) inputSection.style.display = 'block';
    
    Object.values(sensorElements).forEach(el => {
        if (el) el.textContent = "--";
    });
    
    const urlParams = new URLSearchParams(window.location.search);
    const deviceFromUrl = urlParams.get('device');
    
    if (deviceFromUrl) {
        const deviceInput = getElement('deviceIdInput');
        if (deviceInput) {
            deviceInput.value = deviceFromUrl;
            setTimeout(() => loadFirebaseDevice(), 1000);
        }
    }
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', function() {
    const deviceInput = getElement('deviceIdInput');
    if (deviceInput) {
        deviceInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') loadFirebaseDevice();
        });
    }
    
    initializeApp();
});

// ===== PWA SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('✅ ServiceWorker registered:', registration.scope);
            })
            .catch(error => {
                console.log('❌ ServiceWorker registration failed:', error);
            });
    });
}