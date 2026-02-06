// ===== GLOBAL VARIABLES =====
let currentDeviceId = null;
let database = null;
let app = null;
let pumpStatusListener = null;

// ===== HISTORY CHART VARIABLES =====
let historyChart1 = null;
let historyChart2 = null;
let historicalData = [];

// ===== PAGE NAVIGATION =====
function openPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');
    
    // Special handling for each page
    if (pageId === 'sensorDashboardPage') {
        startFirebaseUpdates(currentDeviceId);
    } else if (pageId === 'pumpControlPage') {
        if (currentDeviceId) {
            startPumpStatusUpdates(currentDeviceId);
            loadCurrentPumpStatus(currentDeviceId);
        }
    } else if (pageId === 'historyPage') {
        loadHistoricalData();
    }
}

function goBackToMenu() {
    openPage('menuPage');
}

function goBackToLanding() {
    changeFirebaseDevice();
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
                
                // Update device info on menu page
                document.getElementById('deviceNameDisplay').textContent = 
                    deviceData.info?.name || deviceId.toUpperCase();
                document.getElementById('deviceIdDisplay').textContent = deviceId;
                
                // Update device names on other pages
                document.getElementById('dashboardDeviceName').textContent = 
                    deviceData.info?.name || deviceId.toUpperCase();
                document.getElementById('pumpDeviceName').textContent = 
                    deviceData.info?.name || deviceId.toUpperCase();
                document.getElementById('historyDeviceName').textContent = 
                    deviceData.info?.name || deviceId.toUpperCase();
                
                // Update initial sensor values
                updateFirebaseValues(deviceData.data || {});
                
                // Go to menu page
                openPage('menuPage');
                
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
    console.log("📊 Updating sensor values:", sensorData);
    
    // Update all sensor displays
    const updates = {
        'nitrogen-value': sensorData.nitrogen,
        'phosphorus-value': sensorData.phosphorous,
        'potassium-value': sensorData.potassium,
        'conductivity-value': sensorData.ec,
        'ph-value': sensorData.ph,
        'moisture-value': sensorData.moisture,
        'temperature-value': sensorData.temperature,
        'weight-value': sensorData.weight,
        'tank-level-value': sensorData.level
    };
    
    for (const [id, value] of Object.entries(updates)) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value !== undefined ? 
                (typeof value === 'number' ? value.toFixed(2) : value) : "--";
        }
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
    
    // Stop all listeners
    if (currentDeviceId && database) {
        database.ref('devices/' + currentDeviceId + '/data').off();
        if (pumpStatusListener) {
            database.ref('devices/' + currentDeviceId + '/pump').off();
            pumpStatusListener = null;
        }
    }
    
    // Reset variables
    currentDeviceId = null;
    historicalData = [];
    
    // Go to landing page
    openPage('landingPage');
    
    // Clear input
    const deviceInput = document.getElementById('deviceIdInput');
    if (deviceInput) {
        deviceInput.value = '';
        deviceInput.focus();
    }
    
    // Clear all sensor displays
    const sensorIds = [
        'nitrogen-value', 'phosphorus-value', 'potassium-value',
        'conductivity-value', 'ph-value', 'moisture-value',
        'temperature-value', 'weight-value', 'tank-level-value'
    ];
    
    sensorIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = "--";
    });
    
    // Clear pump status
    document.getElementById('waterPumpStatus').textContent = "OFF";
    document.getElementById('waterPumpStatus').className = "status-off";
    document.getElementById('fertilizerPumpStatus').textContent = "OFF";
    document.getElementById('fertilizerPumpStatus').className = "status-off";
    
    console.log("✅ Reset complete");
}

// ===== PUMP CONTROL FUNCTIONS =====
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
    const statusElement = document.getElementById(`${pumpType}PumpStatus`);
    if (!statusElement) return;
    
    if (state === 1) {
        statusElement.textContent = "ON";
        statusElement.className = "status-on";
    } else {
        statusElement.textContent = "OFF";
        statusElement.className = "status-off";
    }
}

// ===== HISTORY & CHARTS FUNCTIONS =====
function initializeCharts() {
    const chart1Canvas = document.getElementById('singleMetricChart');
    const chart2Canvas = document.getElementById('multiMetricChart');
    
    if (!chart1Canvas || !chart2Canvas) return;
    
    // Single metric chart
    const ctx1 = chart1Canvas.getContext('2d');
    historyChart1 = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Weight (kg)',
                data: [],
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Time' } },
                y: { title: { display: true, text: 'Weight (kg)' } }
            }
        }
    });

    // Multi-metric chart
    const ctx2 = chart2Canvas.getContext('2d');
    historyChart2 = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Weight (kg)',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    yAxisID: 'y',
                    tension: 0.3
                },
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Time' } },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Weight (kg)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Temperature (°C)' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function loadHistoricalData() {
    if (!database || !currentDeviceId) {
        showNotification('Connect to Firebase first', 'warning');
        return;
    }
    
    showNotification('Loading historical data...', 'info');
    
    const historyRef = database.ref('devices/' + currentDeviceId + '/history');
    const limit = document.getElementById('dataPoints')?.value || '20';
    
    let query = historyRef;
    if (limit !== 'all') {
        query = query.limitToLast(parseInt(limit));
    }
    
    query.once('value')
        .then((snapshot) => {
            const data = snapshot.val();
            historicalData = processHistoricalData(data);
            
            if (historicalData.length > 0) {
                updateCharts();
                updateDataTable();
                showNotification(`Loaded ${historicalData.length} data points`, 'success');
            } else {
                showNotification('No historical data found', 'warning');
            }
        })
        .catch((error) => {
            console.error('Error loading history:', error);
            showNotification('Failed to load historical data', 'error');
        });
}

function processHistoricalData(rawData) {
    if (!rawData) return [];
    
    const dataArray = [];
    
    for (const [filename, value] of Object.entries(rawData)) {
        // Now filename is like "1140", "1143" etc
        dataArray.push({
            id: filename,
            timeString: value.time || filename, // Use the time field from data
            timestamp: value.time || filename, // For sorting
            nitrogen: parseFloat(value.nitrogen) || 0,
            phosphorus: parseFloat(value.phosphorous) || 0,
            potassium: parseFloat(value.potassium) || 0,
            temperature: parseFloat(value.temperature) || 0,
            ec: parseFloat(value.ec) || 0,
            moisture: parseFloat(value.moisture) || 0,
            weight: parseFloat(value.weight) || 0
        });
    }
    
    // Sort by time - convert "11:40" to sortable format
    return dataArray.sort((a, b) => {
        // Convert "11:40" to minutes for sorting
        const timeA = convertTimeToMinutes(a.timeString);
        const timeB = convertTimeToMinutes(b.timeString);
        return timeA - timeB;
    });
}

function convertTimeToMinutes(timeStr) {
    // Handle "11:40" format
    if (timeStr.includes(':')) {
        const parts = timeStr.split(':');
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        return hours * 60 + minutes;
    }
    // Handle "1140" format (if no colon)
    else if (timeStr.length === 4) {
        const hours = parseInt(timeStr.substring(0, 2));
        const minutes = parseInt(timeStr.substring(2, 4));
        return hours * 60 + minutes;
    }
    return 0;
}

function updateCharts() {
    if (!historyChart1 || !historyChart2 || historicalData.length === 0) {
        return;
    }
    
    const chartType = document.getElementById('chartType')?.value || 'line';
    
    historyChart1.config.type = chartType;
    historyChart2.config.type = chartType;
    
    // Use the timeString directly from data (already in "11:40" format)
    const labels = historicalData.map(d => d.timeString);
    
    // Update NPK chart
    historyChart1.data.labels = labels;
    historyChart1.data.datasets[0].data = historicalData.map(d => d.nitrogen);
    historyChart1.data.datasets[1].data = historicalData.map(d => d.phosphorus);
    historyChart1.data.datasets[2].data = historicalData.map(d => d.potassium);
    historyChart1.update();
    
    // Update Environment chart
    historyChart2.data.labels = labels;
    historyChart2.data.datasets[0].data = historicalData.map(d => d.temperature);
    historyChart2.data.datasets[1].data = historicalData.map(d => d.ec);
    historyChart2.data.datasets[2].data = historicalData.map(d => d.moisture);
    historyChart2.update();
}

function getMetricLabel(metric) {
    const labels = {
        'weight': 'Weight (kg)',
        'temperature': 'Temperature (°C)',
        'moisture': 'Moisture (%)',
        'ph': 'pH',
        'ec': 'Conductivity (uS/m)'
    };
    return labels[metric] || metric;
}

function updateDataTable() {
    const tableBody = document.getElementById('historyTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (historicalData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="no-data">No historical data available</td>
            </tr>
        `;
        return;
    }
    
    const displayData = [...historicalData].reverse().slice(0, 20);
    
    displayData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.timeString}</td>
            <td>${item.nitrogen.toFixed(2)}</td>
            <td>${item.phosphorus.toFixed(2)}</td>
            <td>${item.potassium.toFixed(2)}</td>
            <td>${item.temperature.toFixed(2)}</td>
            <td>${item.ec.toFixed(2)}</td>
            <td>${item.moisture.toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });
}

function exportHistoricalData() {
    if (historicalData.length === 0) {
        showNotification('⚠️ No data to export', 'warning');
        return;
    }
    
    let csv = 'Timestamp,Weight (kg),Temperature (°C),Moisture (%),pH,Conductivity (uS/m)\n';
    
    historicalData.forEach(item => {
        const date = new Date(item.timestamp).toLocaleString();
        csv += `${date},${item.weight},${item.temperature},${item.moisture},${item.ph},${item.ec}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agri-iot-data-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('📥 Data exported as CSV', 'success');
}

// ===== NOTIFICATION FUNCTION =====
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
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Firebase
    try {
        app = firebase.initializeApp(window.firebaseConfig);
        database = firebase.database();
        console.log("✅ Firebase initialized");
    } catch (error) {
        console.log("ℹ️ Firebase not initialized yet");
    }
    
    // Add Enter key support for device input
    const deviceInput = document.getElementById('deviceIdInput');
    if (deviceInput) {
        deviceInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') loadFirebaseDevice();
        });
    }
    
    // Initialize charts after page loads
    setTimeout(initializeCharts, 1000);
});