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
    database: 'esp32_data',
    charset: 'utf8mb4' // Đảm bảo mã hóa UTF-8
});

const dbDevices = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'devices',
    charset: 'utf8mb4' // Đảm bảo mã hóa UTF-8
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

        if (sensorValues.length === 7) { // Kiểm tra 7 giá trị
            const senderID = sensorValues[0];
            const receiverID = sensorValues[1];
            const deviceID = sensorValues[2];
            const temperature = parseFloat(sensorValues[3]);
            const humidity = parseFloat(sensorValues[4]);
            const soil = parseInt(sensorValues[5]);
            const light = parseInt(sensorValues[6]);

            console.log(`✅ Đã trích xuất: SenderID=${senderID}, ReceiverID=${receiverID}, DeviceID=${deviceID}, Temp=${temperature}, Humid=${humidity}, Soil=${soil}, Light=${light}`);

            dbSensor.query(
                'INSERT INTO sensor_data (Temp, Humid, Soil, Light, timestamp) VALUES (?, ?, ?, ?, NOW())',
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
        const rawData = message.toString().trim();
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
app.post('/api/control_device', (req, res) => {
    const { device, status } = req.body;

    let actionID;

    if (device === 'light') {
        actionID = status === 'ON' ? 1 : status === 'OFF' ? 2 : null;
    } else if (device === 'pump') {
        actionID = status === 'ON' ? 3 : status === 'OFF' ? 4 : null;
    }

    if (actionID === null) {
        return res.status(400).json({ error: 'Trạng thái không hợp lệ hoặc thiết bị không hợp lệ' });
    }

    console.log(`📡 Gửi lệnh: ${actionID}`);
    mqttClient.publish(MQTT_TOPIC_CMD, actionID.toString());

    dbDevices.query(
        'INSERT INTO HistoryDevice (device, action, status, timestamp) VALUES (?, ?, ?, NOW())',
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
        'SELECT Temp, Humid, Soil, Light, timestamp FROM sensor_data ORDER BY id DESC LIMIT 1',
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Lỗi nội bộ máy chủ' });
            if (results.length > 0) {
                const { Temp, Humid, Soil, Light, timestamp } = results[0];
                res.json({ temperature: Temp, humidity: Humid, soil: Soil, light: Light, timestamp });
            } else {
                res.status(404).json({ error: 'Không tìm thấy dữ liệu' });
            }
        }
    );
});

// API để lấy lịch sử cảm biến
app.get('/api/sensor_history', (req, res) => {
    const { limit = 10, page = 1, start_date, end_date } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT id, Temp, Humid, Soil, Light, timestamp FROM sensor_data';
    let queryParams = [];
    let conditions = [];

    if (start_date) {
        conditions.push('timestamp >= ?');
        queryParams.push(start_date);
    }
    if (end_date) {
        conditions.push('timestamp <= ?');
        queryParams.push(end_date);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), parseInt(offset));

    dbSensor.query(query, queryParams, (err, results) => {
        if (err) {
            console.error('❌ Lỗi khi lấy lịch sử cảm biến:', err);
            return res.status(500).json({ error: 'Lỗi nội bộ máy chủ' });
        }

        dbSensor.query(
            'SELECT COUNT(*) as total FROM sensor_data' + (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''),
            queryParams.slice(0, conditions.length),
            (err, countResults) => {
                if (err) {
                    console.error('❌ Lỗi khi đếm tổng bản ghi:', err);
                    return res.status(500).json({ error: 'Lỗi nội bộ máy chủ' });
                }
                const totalRecords = countResults[0].total;
                res.json({
                    data: results,
                    pagination: {
                        totalRecords,
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(totalRecords / limit),
                        limit: parseInt(limit)
                    }
                });
            }
        );
    });
});

// API để lấy lịch sử điều khiển thiết bị
app.get('/api/device_history', (req, res) => {
    const { limit = 10, page = 1, device, start_date, end_date } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT ID, device, action, status, timestamp FROM HistoryDevice';
    let queryParams = [];
    let conditions = [];

    if (device) {
        conditions.push('device = ?');
        queryParams.push(device);
    }
    if (start_date) {
        conditions.push('timestamp >= ?');
        queryParams.push(start_date);
    }
    if (end_date) {
        conditions.push('timestamp <= ?');
        queryParams.push(end_date);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), parseInt(offset));

    dbDevices.query(query, queryParams, (err, results) => {
        if (err) {
            console.error('❌ Lỗi khi lấy lịch sử thiết bị:', err);
            return res.status(500).json({ error: 'Lỗi nội bộ máy chủ' });
        }

        dbDevices.query(
            'SELECT COUNT(*) as total FROM HistoryDevice' + (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''),
            queryParams.slice(0, conditions.length),
            (err, countResults) => {
                if (err) {
                    console.error('❌ Lỗi khi đếm tổng bản ghi:', err);
                    return res.status(500).json({ error: 'Lỗi nội bộ máy chủ' });
                }
                const totalRecords = countResults[0].total;
                res.json({
                    data: results,
                    pagination: {
                        totalRecords,
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(totalRecords / limit),
                        limit: parseInt(limit)
                    }
                });
            }
        );
    });
});

// Phục vụ file tĩnh
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});