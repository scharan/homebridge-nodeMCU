#include <ESP8266mDNS.h>
#include <ESP8266WiFi.h>

const int analogInPin = A0;  // ESP8266 Analog Pin ADC0 = A0

enum LEAK_STATUS {
  NOT_DETECTED = 0,
  DETECTED = 1
};
int ledPin = 2; // GPIO2 & built-in, on-board LED

const char* ssid = "YOUR_VALUE";
const char* password = "YOUR_VALUE";
const char* TYPE = "WaterLeakSensor";

WiFiServer server(80);

void setup() {
  Serial.begin(115200);   // initialize serial communication at 115200, eg., for logs
  delay(10); // Why?

  WiFi.mode(WIFI_STA);

  // Pin 2 has an integrated LED - configure it, and turn it off
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, HIGH);
  delay(100);
  
  // Set the hostname
  String unique_id = WiFi.macAddress() + String(ESP.getChipId(), HEX);
  unique_id.replace(":", "");
  unique_id.toLowerCase();

  WiFi.hostname(TYPE + unique_id);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("WiFi connected");

  server.begin();
  Serial.println("HTTP server started");

  if (MDNS.begin(unique_id)) {
    Serial.println("mDNS boardcasting as: " + unique_id);
    MDNS.addService(TYPE, "tcp", 80 /*port*/);
  } else {
    Serial.println("Failed to start MDNS, restarting ESP");
    ESP.restart();
  }
}

void loop() {
  MDNS.update(); // Seems like this is needed to broadcast mDNS addresses

  WiFiClient client = server.available(); 
  if (!client) {
    return;
  }
  while(client.connected() && !client.available())
  {
    delay(1);
  }

  // Read the first line of the request
  // Useful to handle multiple types of requests
  // String request = client.readStringUntil('\r');

  while (client.available()) {
    // but first, let client finish its request
    // that's diplomatic compliance to protocols
    // (and otherwise some clients may complain, like curl)
    // (that is an example, prefer using a proper webserver library)
    client.read();
  }

  // flush any pending response; should be a no-op
  // as we are creating a new client for every loop iteration
  client.flush(); 

  client.println("HTTP/1.1 200 OK");
  client.println("Content-type:text/json");
  // Is this necessary? Is it better (lowe power usage) to keep connection open?
  // client.println("Connection: close");
  client.println(); // New line to separate HTTP headers from response

  LEAK_STATUS ls = getLeakStatus();
  if (ls == LEAK_STATUS::DETECTED) {
      client.println("{\"LeakDetected\":1}"); // Simpler/more efficient than sprintf()?
  } else {
      client.println("{\"LeakDetected\":0}");
  }

  client.println(); // New line to end HTTP response
  client.stop();
}

LEAK_STATUS getLeakStatus() {
  // Ignore everything from the client
  // treat ALL requests as GET for leak detection
  // read the analog in value
  int sensorValue = analogRead(analogInPin);

  // print the readings in the Serial Monitor
  Serial.println("sensor = " + sensorValue);

  LEAK_STATUS ls = LEAK_STATUS::NOT_DETECTED;
  // ESP2866 on ADC0 is 10 bit, so gets a range 0-1024
  // Here, we consider anything >25% of the range ((i.e., > 256) as a leak
  if (sensorValue <= 256) {
    ls = LEAK_STATUS::NOT_DETECTED;
    digitalWrite(ledPin, HIGH);
  } else {
    ls = LEAK_STATUS::DETECTED;
    digitalWrite(ledPin, LOW);
  }

  return ls;
}
