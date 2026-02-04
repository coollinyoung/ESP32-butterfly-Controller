#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ESP32Servo.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

// 定義 Wi-Fi AP 憑證
const char *ssid = "ESP32_Butterfly_AP";    // AP 的 SSID
const char *password = "123456789";         // AP 的密碼

// 定義 ESP32 IP 位址
IPAddress localIP(192, 168, 5, 1);          // ESP32 作為 AP 的固定 IP 位址
IPAddress gateway(192, 168, 5, 1);          // 閘道器位址
IPAddress subnet(255, 255, 255, 0);         // 子網路遮罩

// 宣告舵機物件
Servo servoLeft;                            // 左舵機物件
Servo servoRight;                           // 右舵機物件

// 定義舵機連接的 GPIO 腳位
const int servoLeftPin = 32;                // 左舵機連接 GPIO 32
const int servoRightPin = 33;               // 右舵機連接 GPIO 33

// 定義舵機 PWM 通道
const int servoLeftChannel = 0;             // 左舵機 PWM 通道 0
const int servoRightChannel = 1;            // 右舵機 PWM 通道 1

// 舵機角度範圍 (可透過 Web 介面設定)
int servoMinAngle = 0;                      // 最小角度
int servoMaxAngle = 180;                    // 最大角度，預設為 180 度

// WebServer 和 WebSocketsServer 物件
AsyncWebServer server(80);                  // 在 Port 80 建立 AsyncWebServer 實例
WebSocketsServer webSocket = WebSocketsServer(81); // 在 Port 81 建立 WebSocketsServer 實例

// 儲存搖桿數據
int joystickX = 0;                          // 搖桿 X 軸數據 (-100 到 100)
int joystickY = 0;                          // 搖桿 Y 軸數據 (-100 到 100)

// 處理 WebSocket 事件
void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:               // 客戶端斷開連接
      Serial.printf("[%u] Disconnected!
", num);
      break;
    case WStype_CONNECTED: {                // 客戶端連接
        IPAddress ip = webSocket.remoteIP(num);
        Serial.printf("[%u] Connected from %d.%d.%d.%d url: %s
", num, ip[0], ip[1], ip[2], ip[3], payload);
      }
      break;
    case WStype_TEXT:                       // 收到文字數據
      Serial.printf("[%u] get Text: %s
", num, payload);

      // 解析 JSON 數據
      // 假設數據格式為 {"type": "joystick", "x": 50, "y": -30} 或 {"type": "angle", "value": 90}
      String message = (char*)payload;
      if (message.indexOf("joystick") != -1) {
        // 解析搖桿數據
        int x_start = message.indexOf("x":") + 3;
        int x_end = message.indexOf(","y");
        joystickX = message.substring(x_start, x_end).toInt();

        int y_start = message.indexOf("y":") + 3;
        int y_end = message.indexOf("}");
        joystickY = message.substring(y_start, y_end).toInt();

        Serial.printf("搖桿數據: X = %d, Y = %d
", joystickX, joystickY);
        // 觸發舵機控制更新
        updateServos();
      } else if (message.indexOf("angle") != -1) {
        // 解析角度設定數據
        int angle_start = message.indexOf("value":") + 7;
        int angle_end = message.indexOf("}");
        int newAngle = message.substring(angle_start, angle_end).toInt();

        if (newAngle >= 0 && newAngle <= 180) { // 限制角度在 0-180 之間
          servoMaxAngle = newAngle;
          Serial.printf("舵機最大角度設定為: %d
", servoMaxAngle);
        }
      }
      break;
  }
}

// 更新舵機位置
void updateServos() {
  // 將搖桿 Y 軸數據從 -100 到 100 映射到舵機速度/角度範圍
  // 垂直方向控制 (速度): 搖桿 Y 軸控制整體速度
  // 將 Y 軸數據映射到 0 到 servoMaxAngle
  int targetAngle = map(joystickY, -100, 100, servoMinAngle, servoMaxAngle);
  
  // 水平方向控制 (差速轉向): 搖桿 X 軸影響左右舵機的相對速度
  // 將 X 軸數據從 -100 到 100 映射到一個偏移量，例如 -50 到 50
  int differential = map(joystickX, -100, 100, -50, 50); // 差速偏移量

  // 計算左右舵機的目標角度
  int angleLeft = targetAngle - differential;
  int angleRight = targetAngle + differential;

  // 限制舵機角度在設定範圍內
  angleLeft = constrain(angleLeft, servoMinAngle, servoMaxAngle);
  angleRight = constrain(angleRight, servoMinAngle, servoMaxAngle);
  
  Serial.printf("左舵機角度: %d, 右舵機角度: %d
", angleLeft, angleRight);

  servoLeft.write(angleLeft);
  servoRight.write(angleRight);
}

void setup() {
  Serial.begin(115200);             // 啟動序列埠通訊

  // 設定 ESP32 為 AP 模式
  WiFi.softAP(ssid, password);      // 建立 Wi-Fi AP
  WiFi.softAPConfig(localIP, gateway, subnet); // 設定 AP 模式的 IP
  
  Serial.print("ESP32 AP 模式已啟動，SSID: ");
  Serial.println(ssid);
  Serial.print("IP 位址: ");
  Serial.println(WiFi.softAPIP());  // 顯示 ESP32 的 IP 位址

  // 初始化舵機
  ESP32PWM::setup();                            // 初始化 ESP32PWM
  servoLeft.attach(servoLeftPin, 500, 2500);    // 綁定左舵機到 GPIO 32，設定 PWM 範圍
  servoRight.attach(servoRightPin, 500, 2500);  // 綁定右舵機到 GPIO 33，設定 PWM 範圍
  
  // 初始舵機位置為中心
  servoLeft.write(90);
  servoRight.write(90);

  // 處理根路徑 "/" 的請求，回傳 index.html
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(SPIFFS, "/index.html", "text/html");
  });

  // 處理 CSS 檔案
  server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(SPIFFS, "/style.css", "text/css");
  });

  // 處理 JavaScript 檔案
  server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(SPIFFS, "/script.js", "application/javascript");
  });

  // 啟動 WebServer
  server.begin();
  Serial.println("HTTP server started");

  // 啟動 WebSocket Server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("WebSocket server started");

  // 載入 Web App 檔案到 SPIFFS (這部分需要手動上傳檔案，程式碼中不包含上傳邏輯)
  // 您需要使用 ESP32 LittleFS/SPIFFS Data Upload 工具將 web_app 資料夾內容上傳到 ESP32
  // 例如：將 index.html, style.css, script.js 檔案上傳到 ESP32 的檔案系統中。
  // 在開發時，確保您的 web_app 檔案已上傳至 ESP32。
  // 這裡假設檔案已上傳，且位於根目錄。
}

void loop() {
  webSocket.loop(); // 處理 WebSocket 客戶端
  // 其他主要程式邏輯可以放在這裡
}
