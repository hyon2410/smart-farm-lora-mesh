const express = require('express');
const mysql = require('mysql2');
const mqtt = require('mqtt');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// MQTT Configuration
const MQTT_BROKER = '192.168.223.176';
const MQTT_PORT = 1885;
const MQTT_TOPIC_CMD = 'home/control';
const MQTT_TOPIC_SENSOR = 'home/sensor';
const MQTT_TOPIC_ACK = 'home/ack';

const mqttClient = mqtt.connect(`mqtt://${MQTT_BROKER}:${MQTT_PORT}`, {
    username: 'user1',
    password: '123456'
});

// MySQL Configuration
const dbSensor = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'esp32_data'
});

const dbDevices = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'devices'
});

// Connect to MySQL
dbSensor.connect(err => {
    if (err) throw err;
    console.log('Connected to sensor database');
});

dbDevices.connect(err => {
    if (err) throw err;
    console.log('Connected to devices database');
});

// MQTT message handler
mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
    mqttClient.subscribe([MQTT_TOPIC_SENSOR, MQTT_TOPIC_ACK], err => {
        if (err) console.error('Failed to subscribe:', err);
    });
});

// Xử lý dữ liệu nhận được từ LoRa
mqttClient.on('message', (topic, message) => {
  const data = message.toString();
  console.log(`📩 Nhận dữ liệu từ MQTT [${topic}]: ${data}`);

  // Xử lý dữ liệu cảm biến
  if (topic === MQTT_TOPIC_SENSOR) {
      const sensorValues = data.split(',');

      if (sensorValues.length === 7) { // Kiểm tra 6 giá trị
          const senderID = sensorValues[0];
          const receiverID = sensorValues[1];
          const deviceID = sensorValues[2];  // ID thiết bị hoặc mã thiết bị
          const temperature = parseFloat(sensorValues[3]);
          const humidity = parseFloat(sensorValues[4]);
          const soil = parseInt(sensorValues[5]);
          const light = parseInt(sensorValues[6]);

          console.log(`✅ Đã trích xuất: SenderID=${senderID}, ReceiverID=${receiverID}, DeviceID=${deviceID}, Temp=${temperature}, Humid=${humidity}, Soil=${soil}, Light=${light}`);

          dbSensor.query(
              'INSERT INTO sensor_data ( Temp, Humid, Soil, Light) VALUES ( ?, ?, ?, ?)',
              [temperature, humidity, soil, light],
              (err) => {
                  if (err) console.error('❌ Lỗi lưu dữ liệu cảm biến:', err);
                  else console.log(`✅ Dữ liệu đã lưu vào MySQL!`);
              }
          );
      } else {
          console.error('⚠️ Dữ liệu không hợp lệ:', data);
      }
  }

  // Xử lý ACK từ LoRa Slave
  if (topic === MQTT_TOPIC_ACK) {
      const rawData = message.toString().trim(); // Xóa khoảng trắng & ký tự thừa
      console.log(`📋 Nhận được ACK từ Slave: ${rawData}`);

      if (rawData === 'ACK') {
          dbDevices.query(
              'UPDATE HistoryDevice SET status = "Đã xác nhận" WHERE status = "Đang chờ ACK"',
              (err) => {
                  if (err) console.error('❌ Lỗi khi cập nhật ACK:', err);
                  else console.log(`✅ ACK đã được lưu vào MySQL`);
              }
          );
      } else {
          console.error(`⚠️ Dữ liệu ACK không hợp lệ: '${rawData}'`);
      }
  }
});
mqttClient.on('error', (err) => {
    console.error('❌ MQTT connection error:', err.message);
});


// API để gửi lệnh qua MQTT
// API để gửi lệnh qua MQTT
app.post('/api/control_device', (req, res) => {
  const { device, status } = req.body;

  let actionID;

  // Chọn actionID dựa trên device và status
  if (device === 'light') {
      actionID = status === 'ON' ? 1 : status === 'OFF' ? 2 : null;
  } else if (device === 'pump') {
      actionID = status === 'ON' ? 3 : status === 'OFF' ? 4 : null;
  }

  // Nếu không có actionID hợp lệ, trả về lỗi
  if (actionID === null) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ hoặc thiết bị không hợp lệ' });
  }

  console.log(`📡 Gửi lệnh: ${actionID}`);  // Kiểm tra lệnh đang gửi ra
  mqttClient.publish(MQTT_TOPIC_CMD, actionID.toString());  // Gửi lệnh MQTT

  // Lưu vào lịch sử điều khiển với trạng thái "Đang chờ ACK"
  dbDevices.query(
      'INSERT INTO HistoryDevice (device, action, status) VALUES (?, ?, ?)',
      [device, status, 'Đang chờ ACK'],
      (err) => {
          if (err) console.error('❌ Lỗi khi lưu lịch sử điều khiển:', err);
          else console.log(`✅ Đã lưu lịch sử điều khiển!`);
      }
  );

  res.json({ message: `Đã gửi lệnh điều khiển ${device} ${status}` });
});


// API để lấy dữ liệu cảm biến mới nhất
app.get('/api/latest_sensor_data', (req, res) => {
    dbSensor.query(
        'SELECT Temp, Humid, Soil, Light FROM sensor_data ORDER BY id DESC LIMIT 1',
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Lỗi nội bộ máy chủ' });
            if (results.length > 0) {
                const { Temp, Humid, Soil, Light } = results[0];
                res.json({ temperature: Temp, humidity: Humid, soil: Soil, light: Light });
            } else {
                res.status(404).json({ error: 'Không tìm thấy dữ liệu' });
            }
        }
    );
});

// API để lấy lịch sử điều khiển thiết bị
app.get('/api/device_history', (req, res) => {
    dbDevices.query(
        'SELECT * FROM HistoryDevice ORDER BY ID DESC LIMIT 10',
        (err, results) => {
            if (err) {
                console.error('❌ Lỗi khi lấy lịch sử thiết bị:', err);
                return res.status(500).json({ error: 'Lỗi nội bộ máy chủ' });
            }
            res.json(results);
        }
    );
});

// Start the server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
