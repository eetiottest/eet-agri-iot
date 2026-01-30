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

// Add this to check which elements are missing:
console.log("Checking sensor elements:");
for (const [key, element] of Object.entries(sensorElements)) {
    console.log(`${key}:`, element ? "✓ Found" : "✗ NULL");
}

let currentDeviceId = null;
let database = null;
let app = null;

// ===== DOM ELEMENTS =====
const serverCheckBtn = document.getElementById('serverCheckBtn');
const statusText = document.getElementById('statusText');
const lastChecked = document.getElementById('lastChecked');
const serverUrlInput = document.getElementById('serverUrl');

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
    
    // Check if device exists
    database.ref('devices/' + deviceId).once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                const deviceData = snapshot.val();
                currentDeviceId = deviceId;
                
                // Update URL
                history.pushState({}, '', `?device=${deviceId}`);
                
                // Show device info
                showDeviceInfo(deviceId, deviceData);
                
                // Update sensor values
                updateFirebaseValues(deviceData.data || {});
                
                // Start real-time updates
                startFirebaseUpdates(deviceId);
                
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

function showDeviceInfo(deviceId, deviceData) {
    // Hide input section
    document.getElementById('firebaseInputSection').style.display = 'none';
    
    // Show device info header
    const infoSection = document.getElementById('deviceInfoHeader');
    infoSection.style.display = 'block';
    
    // Update device info
    document.getElementById('deviceNameDisplay').textContent = 
        deviceData.info?.name || deviceId.toUpperCase();
    document.getElementById('deviceIdDisplay').textContent = deviceId;
}

function updateFirebaseValues(sensorData) {
    console.log("Updating with Firebase data:", sensorData);
    
    // Update NPK values (using YOUR field names)
    sensorElements.nitrogen.textContent = sensorData.nitrogen;
    sensorElements.phosphorus.textContent = sensorData.phosphorous; // Note spelling
    sensorElements.potassium.textContent = sensorData.potassium;
    
    // Update additional sensors
    sensorElements.conductivity.textContent = sensorData.ec;
    sensorElements.ph.textContent = sensorData.ph; 
    sensorElements.moisture.textContent = sensorData.moisture
    sensorElements.temperature.textContent = sensorData.temperature;
    sensorElements.weight.textContent = sensorData.weight;
    
    // Update tank level (using level field)
    sensorElements.level.textContent = sensorData.level;

}

function formatValue(value, unit) {
    if (value === undefined || value === null || value === "") {
        return "--";
    }
    return value + unit;
}

function startFirebaseUpdates(deviceId) {
    // Listen for real-time data updates
    database.ref('devices/' + deviceId + '/data').on('value', (snapshot) => {
        const newData = snapshot.val();
        if (newData) {
            updateFirebaseValues(newData);
            console.log("📡 Real-time update received");
            lastChecked.textContent = new Date().toLocaleTimeString();
        }
    });
}

function changeFirebaseDevice() {
    // Stop listening to current device
    if (currentDeviceId && database) {
        database.ref('devices/' + currentDeviceId + '/data').off();
    }
    
    // Reset
    currentDeviceId = null;
    
    // Hide device info, show input
    document.getElementById('deviceInfoHeader').style.display = 'none';
    document.getElementById('firebaseInputSection').style.display = 'block';
    
    // Clear input
    document.getElementById('deviceIdInput').value = '';
    document.getElementById('deviceIdInput').focus();
    
    // Clear sensor values
    Object.values(sensorElements).forEach(el => {
        el.textContent = "--";
    });
}

// ===== UI HELPER FUNCTIONS =====
function showNotification(message, type = 'info') {
    const existing = document.getElementById('serverNotification');
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
    
    // Set default server URL
    serverUrlInput.value = "http://192.168.1.100";
    
    // Clear all sensor values
    Object.values(sensorElements).forEach(el => {
        el.textContent = "--";
    });
    
    // Check URL for device parameter
    const urlParams = new URLSearchParams(window.location.search);
    const deviceFromUrl = urlParams.get('device');
    
    if (deviceFromUrl) {
        document.getElementById('deviceIdInput').value = deviceFromUrl;
        setTimeout(() => loadFirebaseDevice(), 1000); // Delay to ensure Firebase loads
    }
}

// ===== EVENT LISTENERS =====
// Add Enter key support for device input
document.getElementById('deviceIdInput')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') loadFirebaseDevice();
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

// ===== START THE APP =====
window.addEventListener('DOMContentLoaded', initializeApp);