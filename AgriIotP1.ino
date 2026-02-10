#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include "HX711.h"

// Load Cell 1 (Plant 1 weight)
const int LOADCELL1_DOUT_PIN = 16;
const int LOADCELL1_SCK_PIN = 17;
const float CALIBRATION_FACTOR1 = 217.0;
HX711 scale1;

// Load Cell 2 (Plant 2 weight)
const int LOADCELL2_DOUT_PIN = 18;
const int LOADCELL2_SCK_PIN = 19;
const float CALIBRATION_FACTOR2 = 211.0;
HX711 scale2;

// Load Cell 3 (Plant 3 weight)
const int LOADCELL3_DOUT_PIN = 22;
const int LOADCELL3_SCK_PIN = 23;
const float CALIBRATION_FACTOR3 = 215.0;
HX711 scale3;

// Load Cell 4 (Plant 4 weight)
const int LOADCELL4_DOUT_PIN = 26;
const int LOADCELL4_SCK_PIN = 27;
const float CALIBRATION_FACTOR4 = 201.0;
HX711 scale4;

// Ultrasonic Sensors (2 tanks)
const int TRIG_WATER = 32;     // Water tank trigger
const int ECHO_WATER = 33;     // Water tank echo
const int TRIG_FERT = 12;      // Fertilizer tank trigger  
const int ECHO_FERT = 13;      // Fertilizer tank echo

// WiFi
const char* ssid = "SharmaPUJ6_2.4G";
const char* password = "Puncak27Jalil";

const char* firebaseHost = "eet-agri-iot-default-rtdb.asia-southeast1.firebasedatabase.app";
const String dataPath = "/devices/esp32-A/data.json";
const String historyPath = "/devices/esp32-A/history/";

const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 8 * 3600;  // GMT+8
const int daylightOffset_sec = 0;

unsigned long lastHistorySave = 0;
const unsigned long historyInterval = 30000;  // 30 seconds

float readWaterLevel(int trigPin, int echoPin);
void sendToFirebase(float n, float p, float k, float ec, float ph, float moist, 
                    float temp, float plant1weight, float plant2weight, 
                    float plant3weight, float plant4weight, float waterLevel, 
                    float fertilizerLevel, String currentTime);

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("=== ESP32 Agri-IOT System ===");
  Serial.println("Initializing sensors...");
  
  // Load Cell 1 (Plant 1)
  Serial.println("Initializing plant 1 load cell...");
  scale1.begin(LOADCELL1_DOUT_PIN, LOADCELL1_SCK_PIN);
  scale1.set_scale(CALIBRATION_FACTOR1);
  scale1.tare();
  Serial.println("Plant 1 load cell ready");
  
  // Load Cell 2 (Plant 2)
  Serial.println("Initializing plant 2 load cell...");
  scale2.begin(LOADCELL2_DOUT_PIN, LOADCELL2_SCK_PIN);
  scale2.set_scale(CALIBRATION_FACTOR2);
  scale2.tare();
  Serial.println("Plant 2 load cell ready");
  
  // Load Cell 3 (Plant 3)
  Serial.println("Initializing plant 3 load cell...");
  scale3.begin(LOADCELL3_DOUT_PIN, LOADCELL3_SCK_PIN);
  scale3.set_scale(CALIBRATION_FACTOR3);
  scale3.tare();
  Serial.println("Plant 3 load cell ready");
  
  // Load Cell 4 (Plant 4)
  Serial.println("Initializing plant 4 load cell...");
  scale4.begin(LOADCELL4_DOUT_PIN, LOADCELL4_SCK_PIN);
  scale4.set_scale(CALIBRATION_FACTOR4);
  scale4.tare();
  Serial.println("Plant 4 load cell ready");
  
  // Ultrasonic sensors
  Serial.println("Initializing ultrasonic sensors...");
  pinMode(TRIG_WATER, OUTPUT);
  pinMode(ECHO_WATER, INPUT);
  pinMode(TRIG_FERT, OUTPUT);
  pinMode(ECHO_FERT, INPUT);
  Serial.println("Ultrasonic sensors ready");
  
  // WiFi connection
  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  
  // Time synchronization
  Serial.println("Synchronizing time...");
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  struct tm timeinfo;
  while(!getLocalTime(&timeinfo)) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nTime synchronized");
  
  Serial.println("=== System Ready ===");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    struct tm timeinfo;
    if (getLocalTime(&timeinfo)) {
      char timeBuffer[20];
      strftime(timeBuffer, sizeof(timeBuffer), "%H:%M:%S", &timeinfo);
      String currentTime = String(timeBuffer);
      
      Serial.print("\n[");
      Serial.print(currentTime);
      Serial.println("] Reading sensors...");
      
      // Read plant 1 weight (kg)
      float plant1weight = 0;
      if (scale1.is_ready()) {
        plant1weight = scale1.get_units(3) / 1000.0;
        if (plant1weight < 0) plant1weight = 0;
        Serial.print("Plant 1 weight: ");
        Serial.print(plant1weight, 3);
        Serial.println(" kg");
      }
      
      // Read plant 2 weight (kg)
      float plant2weight = 0;
      if (scale2.is_ready()) {
        plant2weight = scale2.get_units(3) / 1000.0;
        if (plant2weight < 0) plant2weight = 0;
        Serial.print("Plant 2 weight: ");
        Serial.print(plant2weight, 3);
        Serial.println(" kg");
      }
      
      // Read plant 3 weight (kg)
      float plant3weight = 0;
      if (scale3.is_ready()) {
        plant3weight = scale3.get_units(3) / 1000.0;
        if (plant3weight < 0) plant3weight = 0;
        Serial.print("Plant 3 weight: ");
        Serial.print(plant3weight, 3);
        Serial.println(" kg");
      }
      
      // Read plant 4 weight (kg)
      float plant4weight = 0;
      if (scale4.is_ready()) {
        plant4weight = scale4.get_units(3) / 1000.0;
        if (plant4weight < 0) plant4weight = 0;
        Serial.print("Plant 4 weight: ");
        Serial.print(plant4weight, 3);
        Serial.println(" kg");
      }
      
      // Read water tank level
      float waterLevel = readWaterLevel(TRIG_WATER, ECHO_WATER);
      Serial.print("Water tank level: ");
      if (waterLevel >= 0) {
        Serial.print(waterLevel, 1);
        Serial.println(" cm");
      } else {
        Serial.println("Error");
      }
      
      // Read fertilizer tank level  
      float fertilizerLevel = readWaterLevel(TRIG_FERT, ECHO_FERT);
      Serial.print("Fertilizer tank level: ");
      if (fertilizerLevel >= 0) {
        Serial.print(fertilizerLevel, 1);
        Serial.println(" cm");
      } else {
        Serial.println("Error");
      }
      
      // Other sensors (simulated for now)
      float nitrogen = 100.0 + random(0, 200);
      float phosphorous = 50.0 + random(0, 150);  
      float potassium = 150.0 + random(0, 250);
      float ec = 500.0 + random(0, 2000);
      float ph = 5.5 + (random(0, 50) / 10.0);
      float moisture = 30.0 + random(0, 50);
      float temperature = 25.0 + (random(0, 150) / 10.0);
      
      // Send data to Firebase
      sendToFirebase(nitrogen, phosphorous, potassium, ec, ph, moisture, 
                     temperature, plant1weight, plant2weight, plant3weight, 
                     plant4weight, waterLevel, fertilizerLevel, currentTime);
      
      // Save history every 30 seconds
      if (millis() - lastHistorySave >= historyInterval) {
        Serial.println("Saving history data...");
        
        char keyBuffer[25];
        strftime(keyBuffer, sizeof(keyBuffer), "%Y%m%d_%H%M%S", &timeinfo);
        char isoBuffer[25];
        strftime(isoBuffer, sizeof(isoBuffer), "%Y-%m-%d %H:%M:%S", &timeinfo);
        
        String historyUrl = "https://" + String(firebaseHost) + historyPath + String(keyBuffer) + ".json";
        String historyPayload = "{";
        historyPayload += "\"readableTime\":\"" + String(isoBuffer) + "\",";
        historyPayload += "\"nitrogen\":" + String(nitrogen, 1) + ",";
        historyPayload += "\"phosphorous\":" + String(phosphorous, 1) + ",";
        historyPayload += "\"potassium\":" + String(potassium, 1) + ",";
        historyPayload += "\"ec\":" + String(ec, 1) + ",";
        historyPayload += "\"ph\":" + String(ph, 1) + ",";
        historyPayload += "\"moisture\":" + String(moisture, 1) + ",";
        historyPayload += "\"temperature\":" + String(temperature, 1) + ",";
        historyPayload += "\"plant1weight\":" + String(plant1weight, 3) + ",";
        historyPayload += "\"plant2weight\":" + String(plant2weight, 3) + ",";
        historyPayload += "\"plant3weight\":" + String(plant3weight, 3) + ",";
        historyPayload += "\"plant4weight\":" + String(plant4weight, 3) + ",";
        historyPayload += "\"waterLevel\":" + String(waterLevel, 1) + ",";
        historyPayload += "\"fertilizerLevel\":" + String(fertilizerLevel, 1);
        historyPayload += "}";
        
        HTTPClient http;
        http.begin(historyUrl);
        http.addHeader("Content-Type", "application/json");
        int httpCode = http.PUT(historyPayload);
        http.end();
        
        if (httpCode > 0) {
          Serial.print("History saved. Status: ");
          Serial.println(httpCode);
        }
        
        lastHistorySave = millis();
      }
      
    } else {
      Serial.println("Failed to get time");
    }
    
  } else {
    Serial.println("WiFi disconnected. Reconnecting...");
    WiFi.reconnect();
    delay(5000);
  }
  
  delay(5000);  // Wait 5 seconds between readings
}

float readWaterLevel(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  
  long duration = pulseIn(echoPin, HIGH, 30000);
  
  if (duration == 0) {
    return -1.0;
  }
  
  float distance_cm = (duration * 0.0343) / 2.0;
  
  if (distance_cm < 2.0 || distance_cm > 400.0) {
    return -1.0;
  }
  
  return distance_cm;
}

void sendToFirebase(float nitrogen, float phosphorous, float potassium, 
                    float ec, float ph, float moisture, float temperature, 
                    float plant1weight, float plant2weight, float plant3weight, 
                    float plant4weight, float waterLevel, float fertilizerLevel, 
                    String currentTime) {
  HTTPClient http;
  String url = "https://" + String(firebaseHost) + dataPath;
  
  String jsonPayload = "{";
  jsonPayload += "\"nitrogen\":" + String(nitrogen, 1) + ",";
  jsonPayload += "\"phosphorous\":" + String(phosphorous, 1) + ",";
  jsonPayload += "\"potassium\":" + String(potassium, 1) + ",";
  jsonPayload += "\"ec\":" + String(ec, 1) + ",";
  jsonPayload += "\"ph\":" + String(ph, 1) + ",";
  jsonPayload += "\"moisture\":" + String(moisture, 1) + ",";
  jsonPayload += "\"temperature\":" + String(temperature, 1) + ",";
  jsonPayload += "\"plant1weight\":" + String(plant1weight, 3) + ",";
  jsonPayload += "\"plant2weight\":" + String(plant2weight, 3) + ",";
  jsonPayload += "\"plant3weight\":" + String(plant3weight, 3) + ",";
  jsonPayload += "\"plant4weight\":" + String(plant4weight, 3) + ",";
  jsonPayload += "\"waterLevel\":" + String(waterLevel, 1) + ",";
  jsonPayload += "\"fertilizerLevel\":" + String(fertilizerLevel, 1) + ",";
  jsonPayload += "\"lastUpdated\":\"" + currentTime + "\"";
  jsonPayload += "}";
  
  Serial.print("Sending to Firebase... ");
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(jsonPayload);
  http.end();
  
  if (httpCode > 0) {
    Serial.print("Success. Status: ");
    Serial.println(httpCode);
  } else {
    Serial.print("Failed. Error: ");
    Serial.println(httpCode);
  }
}
