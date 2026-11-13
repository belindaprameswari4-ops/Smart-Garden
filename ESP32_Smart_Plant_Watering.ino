/*
  SMART PLANT WATERING SYSTEM - ESP32 + BLYNK
  Datastream: V1 soil %, V2 humidity %, V3 mode (1 auto/0 manual),
  V4 pump (1 on/0 off), V5 temperature C, V6 time HH:MM (String),
  V7 duration minutes, V8 schedule enable.

  IMPORTANT: Replace Wi-Fi and Blynk credentials before uploading.
  For security, use the NEW Blynk token generated after rotating the exposed token.
*/
#define BLYNK_TEMPLATE_ID "TMPL6eb0qObFo"
#define BLYNK_TEMPLATE_NAME "Smart Garden"
#define BLYNK_AUTH_TOKEN "PASTE_NEW_BLYNK_TOKEN_HERE"
#define BLYNK_PRINT Serial

#include <WiFi.h>
#include <WiFiClient.h>
#include <BlynkSimpleEsp32.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <time.h>

char ssid[] = "YOUR_WIFI_NAME";
char pass[] = "YOUR_WIFI_PASSWORD";

#define DHTPIN 5
#define DHTTYPE DHT11
#define SOIL_PIN 34
#define PUMP_PIN 14
#define PUMP_ON LOW
#define PUMP_OFF HIGH

DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);
BlynkTimer timer;

const int AirValue = 2620;
const int WaterValue = 1180;
const int SOIL_THRESHOLD = 40;

int soilRaw = 0, soilPercent = 0, wateringDuration = 5;
float humidity = 0, temperature = 0;
bool autoMode = true, pumpState = false;
bool scheduleEnabled = false, scheduledPump = false;
String scheduleTime = "07:00", lastScheduleDate = "";
unsigned long wateringStart = 0, wateringDurationMs = 0;

void updateLCD() {
  lcd.setCursor(0, 0);
  lcd.print("Soil:"); lcd.print(soilPercent); lcd.print("% T:");
  lcd.print((int)temperature); lcd.print("C   ");
  lcd.setCursor(0, 1);
  lcd.print("Hum:"); lcd.print((int)humidity); lcd.print("% P:");
  lcd.print(pumpState ? "ON " : "OFF");
  lcd.print("   ");
}
void setPump(bool on) {
  if (pumpState == on) { updateLCD(); return; }
  pumpState = on;
  digitalWrite(PUMP_PIN, on ? PUMP_ON : PUMP_OFF);
  Serial.printf("POMPA: %s\n", on ? "ON" : "OFF");
  if (Blynk.connected()) Blynk.virtualWrite(V4, on ? 1 : 0);
  updateLCD();
}
void readSensors() {
  float h = dht.readHumidity(), t = dht.readTemperature();
  if (!isnan(h) && !isnan(t)) {
    humidity = h; temperature = t;
    if (Blynk.connected()) {
      Blynk.virtualWrite(V2, humidity);
      Blynk.virtualWrite(V5, temperature);
    }
  } else Serial.println("DHT11 tidak terbaca.");
  soilRaw = analogRead(SOIL_PIN);
  soilPercent = constrain(map(soilRaw, AirValue, WaterValue, 0, 100), 0, 100);
  if (Blynk.connected()) Blynk.virtualWrite(V1, soilPercent);
  updateLCD();
}
BLYNK_CONNECTED() {
  Serial.println("BLYNK CONNECTED");
  Blynk.syncVirtual(V3, V6, V7, V8);
  Blynk.virtualWrite(V1, soilPercent);
  Blynk.virtualWrite(V2, humidity);
  Blynk.virtualWrite(V4, pumpState ? 1 : 0);
  Blynk.virtualWrite(V5, temperature);
}
BLYNK_WRITE(V3) {
  autoMode = param.asInt() == 1;
  Serial.println(autoMode ? "MODE AUTO" : "MODE MANUAL");
  if (!autoMode && scheduledPump) {
    scheduledPump = false;
    setPump(false);
  }
}
BLYNK_WRITE(V4) {
  int value = param.asInt();
  if (!autoMode) {
    scheduledPump = false;
    setPump(value == 1);
  } else {
    Serial.println("Kontrol pompa manual ditolak karena mode AUTO.");
    Blynk.virtualWrite(V4, pumpState ? 1 : 0);
  }
}
BLYNK_WRITE(V6) {
  String value = param.asStr();
  if (value.length() == 5 && value.charAt(2) == ':' &&
      value.substring(0,2).toInt() >= 0 && value.substring(0,2).toInt() <= 23 &&
      value.substring(3,5).toInt() >= 0 && value.substring(3,5).toInt() <= 59) {
    scheduleTime = value;
    Serial.printf("Jadwal: %s\n", scheduleTime.c_str());
  } else Serial.println("Format V6 harus HH:MM.");
}
BLYNK_WRITE(V7) {
  int value = param.asInt();
  if (value >= 1 && value <= 30) wateringDuration = value;
  Serial.printf("Durasi: %d menit\n", wateringDuration);
}
BLYNK_WRITE(V8) {
  scheduleEnabled = param.asInt() == 1;
  Serial.println(scheduleEnabled ? "JADWAL AKTIF" : "JADWAL NONAKTIF");
  if (!scheduleEnabled && scheduledPump) {
    scheduledPump = false;
    setPump(false);
  }
}
void checkSoilWatering() {
  if (!autoMode || scheduledPump) return;
  if (soilPercent < SOIL_THRESHOLD) setPump(true);
  else setPump(false);
}
void checkSchedule() {
  time_t now = time(nullptr);
  if (now < 1700000000) return;
  struct tm ti;
  if (!getLocalTime(&ti, 10)) return;
  if (scheduledPump) {
    if (millis() - wateringStart >= wateringDurationMs) {
      scheduledPump = false;
      Serial.println("PENYIRAMAN TERJADWAL SELESAI");
      setPump(false);
    }
    return;
  }
  if (!autoMode || !scheduleEnabled) return;
  char clockText[6];
  snprintf(clockText, sizeof(clockText), "%02d:%02d", ti.tm_hour, ti.tm_min);
  String today = String(ti.tm_year + 1900) + "-" + String(ti.tm_mon + 1) + "-" + String(ti.tm_mday);
  if (scheduleTime == String(clockText) && lastScheduleDate != today) {
    lastScheduleDate = today;
    scheduledPump = true;
    wateringStart = millis();
    wateringDurationMs = (unsigned long)wateringDuration * 60000UL;
    Serial.println("PENYIRAMAN TERJADWAL DIMULAI");
    setPump(true);
  }
}
void setup() {
  Serial.begin(115200);
  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, PUMP_OFF);
  analogReadResolution(12);
  dht.begin();
  lcd.init(); lcd.backlight();
  lcd.setCursor(0,0); lcd.print("SMART PLANT");
  lcd.setCursor(0,1); lcd.print("INITIALIZING...");
  configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com");
  Blynk.begin(BLYNK_AUTH_TOKEN, ssid, pass);
  timer.setInterval(2000L, readSensors);
  timer.setInterval(1000L, checkSoilWatering);
  timer.setInterval(1000L, checkSchedule);
  timer.setInterval(1000L, updateLCD);
  readSensors();
  Serial.println("SMART PLANT WATERING READY");
}
void loop() {
  Blynk.run();
  timer.run();
}
