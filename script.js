// ===== GLOBAL VARIABLES =====
let currentDeviceId = null;
let database = null;
let app = null;
let pumpStatusListener = null;

// ===== HISTORY CHART VARIABLES =====
let npkChart = null;
let environmentChart = null;
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
        if (npkChart === null || environmentChart === null) {
            setTimeout(initializeCharts, 100);
        }
        setTimeout(loadHistoricalData, 200);
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
    
    const updates = {
        'nitrogen-value': sensorData.nitrogen,
        'phosphorus-value': sensorData.phosphorous,
        'potassium-value': sensorData.potassium,
        'conductivity-value': sensorData.ec,
        'ph-value': sensorData.ph,
        'moisture-value': sensorData.moisture,
        'temperature-value': sensorData.temperature,
        'weight1-value': sensorData.plant1weight,
        'weight2-value': sensorData.plant2weight,
        'weight3-value': sensorData.plant3weight,
        'weight4-value': sensorData.plant4weight,
        'tank-level-value': sensorData.waterLevel,
        'fertilizer-level-value': sensorData.fertilizerLevel
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
    console.log("Changing device...");
    
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
        'temperature-value', 'weight1-value', 'weight2-value', 'weight3-value', 'weight4-value',
        'fertilizer-level-value'  // Added fertilizer level
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

function controlBothPumps(state) {
    if (!currentDeviceId || !database) {
        showNotification("⚠️ Not connected to device", "error");
        return;
    }
    
    const command = state === 1 ? "ON" : "OFF";
    const updates = {
        [`devices/${currentDeviceId}/pump/water`]: state,
        [`devices/${currentDeviceId}/pump/fertilizer`]: state
    };
    
    database.ref().update(updates)
        .then(() => {
            showNotification(`✅ Both pumps turned ${command}`, "success");
        })
        .catch((error) => {
            console.error("Error controlling pumps:", error);
            showNotification(`❌ Failed to control pumps: ${error.message}`, "error");
        });
}

// ===== HISTORY & CHARTS FUNCTIONS =====
function initializeCharts() {
    const npkCanvas = document.getElementById('npkChart');
    const envCanvas = document.getElementById('environmentChart');
    
    if (!npkCanvas || !envCanvas) {
        console.log("Charts not ready yet, will retry");
        setTimeout(initializeCharts, 100);
        return;
    }
    
    // Destroy existing charts if they exist
    if (npkChart) {
        npkChart.destroy();
    }
    if (environmentChart) {
        environmentChart.destroy();
    }
    
    // NPK Chart
    const ctx1 = npkCanvas.getContext('2d');
    npkChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Nitrogen (N)',
                    data: [],
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Phosphorus (P)',
                    data: [],
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Potassium (K)',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                }
            },
            scales: {
                x: { 
                    title: { 
                        display: true, 
                        text: 'Time'
                    }
                },
                y: { 
                    title: { 
                        display: true, 
                        text: 'mg/kg'
                    },
                    beginAtZero: true
                }
            }
        }
    });

    // Environment Chart
    const ctx2 = envCanvas.getContext('2d');
    environmentChart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: 'rgb(255, 159, 64)',
                    backgroundColor: 'rgba(255, 159, 64, 0.1)',
                    borderWidth: 2,
                    yAxisID: 'y',
                    tension: 0.3
                },
                {
                    label: 'Conductivity (uS/m)',
                    data: [],
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.1)',
                    borderWidth: 2,
                    yAxisID: 'y1',
                    tension: 0.3
                },
                {
                    label: 'Moisture (%)',
                    data: [],
                    borderColor: 'rgb(201, 203, 207)',
                    backgroundColor: 'rgba(201, 203, 207, 0.1)',
                    borderWidth: 2,
                    yAxisID: 'y2',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                }
            },
            scales: {
                x: { 
                    title: { 
                        display: true, 
                        text: 'Time'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { 
                        display: true, 
                        text: 'Temperature (°C)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { 
                        display: true, 
                        text: 'Conductivity (uS/m)'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                },
                y2: {
                    type: 'linear',
                    display: false,
                    position: 'right'
                }
            }
        }
    });
    
    console.log("✅ Charts initialized");
}

function loadHistoricalData() {
    if (!database || !currentDeviceId) {
        showNotification('⚠️ Connect to a device first', 'warning');
        return;
    }
    
    showNotification('📊 Loading historical data...', 'info');
    
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
                showNotification(`✅ Loaded ${historicalData.length} data points`, 'success');
            } else {
                showNotification('⚠️ No historical data found', 'warning');
            }
        })
        .catch((error) => {
            console.error('Error loading history:', error);
            showNotification('❌ Failed to load historical data', 'error');
        });
}

function processHistoricalData(rawData) {
    if (!rawData) return [];
    
    const dataArray = [];
    
    for (const [filename, value] of Object.entries(rawData)) {
        let displayTime = '';
        let sortableTime = 0;
        
        // Parse the filename or readableTime
        if (value.readableTime) {
            // Use readableTime if available
            try {
                const date = new Date(value.readableTime.replace(' ', 'T'));
                if (!isNaN(date.getTime())) {
                    sortableTime = date.getTime();
                    displayTime = formatDateHourMinute(date);
                } else {
                    displayTime = value.readableTime;
                }
            } catch (e) {
                displayTime = value.readableTime;
            }
        } else {
            // Parse filename like "20260206_150335"
            displayTime = parseFilename(filename);
        }
        
        dataArray.push({
            id: filename,
            timeString: displayTime,
            timestamp: sortableTime,
            readableTime: value.readableTime || filename,
            nitrogen: parseFloat(value.nitrogen) || 0,
            phosphorus: parseFloat(value.phosphorous) || 0,
            potassium: parseFloat(value.potassium) || 0,
            temperature: parseFloat(value.temperature) || 0,
            ec: parseFloat(value.ec) || 0,
            moisture: parseFloat(value.moisture) || 0,
            ph: parseFloat(value.ph) || 0,
            weight: parseFloat(value.weight) || 0
        });
    }
    
    // Sort by timestamp (oldest first)
    return dataArray.sort((a, b) => a.timestamp - b.timestamp);
}

function parseFilename(filename) {
    // Parse filename like "20260206_150335"
    try {
        if (filename.includes('_')) {
            const parts = filename.split('_');
            if (parts.length >= 2) {
                const datePart = parts[0]; // "20260206"
                const timePart = parts[1]; // "150335"
                
                if (datePart.length === 8 && timePart.length >= 4) {
                    const year = datePart.substring(0, 4);
                    const month = parseInt(datePart.substring(4, 6)) - 1;
                    const day = datePart.substring(6, 8);
                    const hour = timePart.substring(0, 2);
                    const minute = timePart.substring(2, 4);
                    
                    const date = new Date(year, month, day, hour, minute);
                    return formatDateHourMinute(date);
                }
            }
        }
    } catch (e) {
        console.warn('Error parsing filename:', e);
    }
    
    return filename;
}

function formatDateHourMinute(date) {
    if (!date || isNaN(date.getTime())) {
        return 'N/A';
    }
    
    // Format as "Feb 6, 15:03"
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${month} ${day}, ${hours}:${minutes}`;
}

function updateCharts() {
    if (!npkChart || !environmentChart || historicalData.length === 0) {
        console.log("Charts not ready or no data");
        return;
    }
    
    const chartType = document.getElementById('chartType')?.value || 'line';
    
    // Update chart types
    npkChart.config.type = chartType;
    environmentChart.config.type = chartType;
    
    // Get labels (time strings)
    const labels = historicalData.map(d => d.timeString);
    
    // Update NPK chart
    npkChart.data.labels = labels;
    npkChart.data.datasets[0].data = historicalData.map(d => d.nitrogen);
    npkChart.data.datasets[1].data = historicalData.map(d => d.phosphorus);
    npkChart.data.datasets[2].data = historicalData.map(d => d.potassium);
    
    // Update Environment chart
    environmentChart.data.labels = labels;
    environmentChart.data.datasets[0].data = historicalData.map(d => d.temperature);
    environmentChart.data.datasets[1].data = historicalData.map(d => d.ec);
    environmentChart.data.datasets[2].data = historicalData.map(d => d.moisture);
    
    // Update both charts
    npkChart.update();
    environmentChart.update();
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
    
    // Show most recent 20 entries (reverse the sorted array)
    const displayData = [...historicalData].reverse().slice(0, 20);
    
    displayData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.timeString}</td>
            <td>${item.nitrogen.toFixed(1)}</td>
            <td>${item.phosphorus.toFixed(1)}</td>
            <td>${item.potassium.toFixed(1)}</td>
            <td>${item.temperature.toFixed(1)}</td>
            <td>${item.ec.toFixed(0)}</td>
            <td>${item.moisture.toFixed(1)}</td>
        `;
        tableBody.appendChild(row);
    });
}

function exportHistoricalData() {
    if (historicalData.length === 0) {
        showNotification('⚠️ No data to export', 'warning');
        return;
    }
    
    let csv = 'Timestamp,Nitrogen (mg/kg),Phosphorus (mg/kg),Potassium (mg/kg),Temperature (°C),Conductivity (uS/m),Moisture (%),pH\n';
    
    historicalData.forEach(item => {
        csv += `"${item.readableTime}",${item.nitrogen},${item.phosphorus},${item.potassium},${item.temperature},${item.ec},${item.moisture},${item.ph},\n`;
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
    
    showNotification('Data exported as CSV', 'success');
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
        font-size: 14px;
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
    // Add Enter key support for device input
    const deviceInput = document.getElementById('deviceIdInput');
    if (deviceInput) {
        deviceInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') loadFirebaseDevice();
        });
    }
    
    // Initialize charts when history page might be opened
    document.getElementById('historyPage').addEventListener('click', function() {
        setTimeout(initializeCharts, 100);
    });
    
    // Handle chart type change
    const chartTypeSelect = document.getElementById('chartType');
    if (chartTypeSelect) {
        chartTypeSelect.addEventListener('change', updateCharts);
    }
    
    // Handle data points change
    const dataPointsSelect = document.getElementById('dataPoints');
    if (dataPointsSelect) {
        dataPointsSelect.addEventListener('change', loadHistoricalData);
    }
    
    // Handle refresh button
    const refreshBtn = document.querySelector('.btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadHistoricalData);
    }
    
    // Handle export button
    const exportBtn = document.querySelector('.btn-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportHistoricalData);
    }
    
    console.log("✅ Script loaded successfully");
});