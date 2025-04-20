# smart-farm-lora-mesh

The **Smart Farm system uses the LoRa Mesh network** to monitor and control the farming environment in a smart, reliable and energy-saving way. Sensor nodes transmit data via the **LoRa Mesh** network, which helps to expand coverage and ensure stable connection even in remote areas without Internet.

## System components

### 1. Sensor Node
- Microcontroller: ESP32 / STM32
- Integrated sensors:
- DHT11/DHT22 (temperature, humidity)
- BH1750 (light)
- Soil Moisture sensor
- LoRa module: SX1278 / RFM95
- Power: Battery + Solar (if needed)

### 2. Intermediate node (Repeater)
- Has the role of forwarding data between nodes
- Uses the same LoRa module + MCU (ESP32 or STM32)

### 3. Gateway (Connection gateway)
- ESP32 connects LoRa + WiFi
- Sends data to **MQTT broker**
- Communicates with **Backend Server (Node.js + MySQL)**

---

## Features

- Sends sensor data from nodes over **LoRa network Mesh**
- Each node can operate independently and communicate with each other
- Gateway receives data, sends to **MQTT broker**
- Server processes and stores data in **MySQL**
- Remote control of devices (fans, water pumps, lights...)
- Web interface for monitoring and control

---

## Software structure

```
SmartFarm-LoraMesh/
│
├── firmware/ # Embedded code for sensor nodes, repeaters, and gateways
│ ├── sensor_node/ # Send sensor data
│ ├── repeater_node/ # Forward LoRa packets
│ └── gateway_node/ # Send data to MQTT
│
├── backend/ # Node.js + Express server
│ ├── mqtt_handler.js # Get data from MQTT and save to DB
│ ├── api/ # REST API to get data / control
│ └── database/ # MySQL: esp32_data, devices
│
├── dashboard/ # Web Interface (HTML + TailwindCSS + JS)
│ ├── index.html
│ ├── js/
│ └── css/
│
└── README.md
```

---

## Deploy the system

### 1. Load the program to the nodes
- Use PlatformIO or Arduino IDE
- Load the corresponding nodes:
- `sensor_node`: Read data, send via LoRa
- `repeater_node`: Receive and forward
- `gateway_node`: Receive from LoRa, send via MQTT

### 2. Start the server
```bash
cd backend
npm install
node mqtt_handler.js
```

### 3. Start the Dashboard
Open `dashboard/index.html` in your browser to view data and control devices.

---

## 🛰 Working principle

1. Sensor Node → send LoRa data (JSON packet)
2. Repeater Node → forward if not reach Gateway
3. Gateway Node → receive packet → send via MQTT (`topic: smartfarm/data`)
4. Server receives MQTT, saves to MySQL
5. Dashboard → displays data and sends control commands

---

## Advantages of LoRa Mesh

- Range up to several kilometers between nodes
- No dependence on the Internet at sensor nodes
- Mesh network helps overcome obstacles or long distances
- Energy saving, suitable for battery or solar power

---

## Used libraries

- LoRaMesh (customized based on RadioHead / LoRaLib)
- MQTT.js, Express, MySQL
- TailwindCSS, Chart.js

---

## Open suggestions wide

- Add AI to predict crop status
- Add surveillance cameras
- Alert via Telegram/Zalo/email when there is an abnormality

---

## Author

- Group/project name: SmartFarm LoRaMesh
- Contact: [huydo9981@gmail.com]
- License: MIT License
```
