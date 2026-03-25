#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include "HX711.h"
#include <HardwareSerial.h>

// --- RS485 BUS A (Sensor 1) ---
#define DE_RE_A 5
#define RX_A 14
#define TX_A 15
HardwareSerial busA(1); // Using UART1

// --- RS485 BUS B (Sensor 2) ---
#define DE_RE_B 21 // Use a spare pin for DE/RE on Bus B
#define RX_B 4
#define TX_B 2
HardwareSerial busB(2); // Using UART2

const byte read_cmd[] = {0x01, 0x03, 0x00, 0x00, 0x00, 0x0F, 0x05, 0xCE};

// --- LOAD CELLS & ULTRASONIC (Kept exactly as yours) ---
HX711 scale1, scale2, scale3, scale4;
const int LC1_D = 16; const int LC1_S = 17;
const int LC2_D = 18; const int LC2_S = 19;
const int LC3_D = 22; const int LC3_S = 23;
const int LC4_D = 26; const int LC4_S = 27;
const int TRIG_WATER = 32; const int ECHO_WATER = 33;
const int TRIG_FERT = 12;  const int ECHO_FERT = 13;

const char* ssid = "SharmaPUJ6_2.4G";
const char* password = "Puncak27Jalil";
const char* firebaseHost = "eet-agri-iot-default-rtdb.asia-southeast1.firebasedatabase.app";
const String dataPath = "/devices/esp32-A/data.json";

void setup() {
  Serial.begin(115200);
  
  // Init Bus A
  busA.begin(4800, SERIAL_8N1, RX_A, TX_A);
  pinMode(DE_RE_A, OUTPUT); digitalWrite(DE_RE_A, LOW);
  
  // Init Bus B
  busB.begin(4800, SERIAL_8N1, RX_B, TX_B);
  pinMode(DE_RE_B, OUTPUT); digitalWrite(DE_RE_B, LOW);

  // Init Load Cells
  scale1.begin(LC1_D, LC1_S); scale1.set_scale(217.0); scale1.tare();
  scale2.begin(LC2_D, LC2_S); scale2.set_scale(211.0); scale2.tare();
  scale3.begin(LC3_D, LC3_S); scale3.set_scale(215.0); scale3.tare();
  scale4.begin(LC4_D, LC4_S); scale4.set_scale(201.0); scale4.tare();

  // Init Ultrasonic
  pinMode(TRIG_WATER, OUTPUT); pinMode(ECHO_WATER, INPUT);
  pinMode(TRIG_FERT, OUTPUT);  pinMode(ECHO_FERT, INPUT);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  configTime(8 * 3600, 0, "pool.ntp.org");
  Serial.println("\nSystem Online - Independent Dual Bus Mode");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    uint16_t reg1[15], reg2[15];
    
    // Read Sensor 1 from Bus A
    bool s1Ok = requestData(busA, DE_RE_A, reg1);
    // Read Sensor 2 from Bus B
    bool s2Ok = requestData(busB, DE_RE_B, reg2);

    // --- Serial Display (Individual) ---
    if(s1Ok) Serial.printf("BUS A -> N:%d P:%d K:%d pH:%.1f Moist:%.1f\n", reg1[7], reg1[8], reg1[9], reg1[3]/10.0, reg1[0]/10.0);
    if(s2Ok) Serial.printf("BUS B -> N:%d P:%d K:%d pH:%.1f Moist:%.1f\n", reg2[7], reg2[8], reg2[9], reg2[3]/10.0, reg2[0]/10.0);

    // --- Averaging Calculations ---
    float avgN = (s1Ok && s2Ok) ? (reg1[7] + reg2[7]) / 2.0 : (s1Ok ? reg1[7] : reg2[7]);
    float avgP = (s1Ok && s2Ok) ? (reg1[8] + reg2[8]) / 2.0 : (s1Ok ? reg1[8] : reg2[8]);
    float avgK = (s1Ok && s2Ok) ? (reg1[9] + reg2[9]) / 2.0 : (s1Ok ? reg1[9] : reg2[9]);
    float avgPH = (s1Ok && s2Ok) ? (reg1[3] + reg2[3]) / 20.0 : (s1Ok ? reg1[3]/10.0 : reg2[3]/10.0);
    float avgEC = (s1Ok && s2Ok) ? (reg1[2] + reg2[2]) / 2.0 : (s1Ok ? reg1[2] : reg2[2]);
    float avgMoist = (s1Ok && s2Ok) ? (reg1[0] + reg2[0]) / 20.0 : (s1Ok ? reg1[0]/10.0 : reg2[0]/10.0);

    // Weights & Tanks
    float w1 = scale1.get_units(3) / 1000.0;
    float w2 = scale2.get_units(3) / 1000.0;
    float w3 = scale3.get_units(3) / 1000.0;
    float w4 = scale4.get_units(3) / 1000.0;
    float waterL = readDistance(TRIG_WATER, ECHO_WATER);
    float fertL  = readDistance(TRIG_FERT, ECHO_FERT);

    struct tm timeinfo;
    getLocalTime(&timeinfo);
    char tBuf[20]; strftime(tBuf, sizeof(tBuf), "%H:%M:%S", &timeinfo);

    sendToFirebase(avgN, avgP, avgK, avgEC, avgPH, avgMoist, reg1[1]/10.0, w1, w2, w3, w4, waterL, fertL, String(tBuf));
  }
  delay(10000); 
}

bool requestData(HardwareSerial &bus, int dePin, uint16_t* data) {
  digitalWrite(dePin, HIGH);
  bus.write(read_cmd, 8);
  bus.flush();
  digitalWrite(dePin, LOW);
  delay(250);
  
  if (bus.available() >= 33) { // 3 (header) + 30 (data) + 2 (crc)
    uint8_t res[64];
    bus.readBytes(res, 33);
    for (int i = 0; i < 15; i++) {
      data[i] = (res[3 + (i * 2)] << 8) | res[4 + (i * 2)];
    }
    return true;
  }
  while(bus.available()) bus.read();
  return false;
}

float readDistance(int trig, int echo) {
  digitalWrite(trig, LOW); delayMicroseconds(2);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long d = pulseIn(echo, HIGH, 30000);
  return (d == 0) ? -1.0 : (d * 0.0343) / 2.0;
}

void sendToFirebase(float n, float p, float k, float ec, float ph, float moist, float temp, 
                    float w1, float w2, float w3, float w4, float wat, float fert, String t) {
  HTTPClient http;
  String url = "https://" + String(firebaseHost) + dataPath;
  String pld = "{\"nitrogen\":" + String(n,1) + ",\"phosphorous\":" + String(p,1) + ",\"potassium\":" + String(k,1) + ",";
  pld += "\"ec\":" + String(ec,1) + ",\"ph\":" + String(ph,1) + ",\"moisture\":" + String(moist,1) + ",";
  pld += "\"temperature\":" + String(temp,1) + ",\"plant1weight\":" + String(w1,3) + ",";
  pld += "\"plant2weight\":" + String(w2,3) + ",\"plant3weight\":" + String(w3,3) + ",";
  pld += "\"plant4weight\":" + String(w4,3) + ",\"waterLevel\":" + String(wat,1) + ",";
  pld += "\"fertilizerLevel\":" + String(fert,1) + ",\"lastUpdated\":\"" + t + "\"}";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(pld);
  Serial.printf("Average Upload: %d\n", code);
  http.end();
}
