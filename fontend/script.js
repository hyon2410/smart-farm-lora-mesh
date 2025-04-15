const apiUrl = "http://192.168.223.176:5000/api/latest_sensor_data"; // API dữ liệu cảm biến
const controlUrl = "http://192.168.223.176:5000/api/control_device"; // API điều khiển thiết bị

// Biến lưu trữ trạng thái thiết bị
let ledState = "OFF";
let pumpState = "OFF";

// Biến lưu trữ nhãn thời gian
let labels = [];
const maxDataPoints = 10; // Giới hạn số điểm dữ liệu

// Cấu hình biểu đồ cảm biến
const data = {
    labels: labels,
    datasets: [
        {
            label: "Nhiệt độ (°C)",
            borderColor: "red",
            backgroundColor: "rgba(255, 0, 0, 0.2)",
            data: [],
            fill: true,
        },
        {
            label: "Độ ẩm không khí (%)",
            borderColor: "blue",
            backgroundColor: "rgba(0, 0, 255, 0.2)",
            data: [],
            fill: true,
        },
        {
            label: "Độ ẩm đất (%)",
            borderColor: "green",
            backgroundColor: "rgba(0, 255, 0, 0.2)",
            data: [],
            fill: true,
        },
        {
            label: "Độ sáng (lux)",
            borderColor: "orange",
            backgroundColor: "rgba(255, 165, 0, 0.2)",
            data: [],
            fill: true,
        },
    ],
};

const config = {
    type: "line",
    data: data,
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                title: {
                    display: true,
                    text: "Thời gian",
                    color: "white",
                    font: { size: 14 },
                },
                ticks: { color: "white" },
            },
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: "Giá trị",
                    color: "white",
                    font: { size: 14 },
                },
                ticks: { color: "white" },
            },
        },
        plugins: {
            legend: {
                labels: { color: "white" },
            },
        },
    },
};

// Tạo biểu đồ cảm biến
const sensorChart = new Chart(document.getElementById("sensorChart"), config);

// Hàm cập nhật dữ liệu cảm biến
async function updateData() {
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error("Không thể lấy dữ liệu từ API!");

        const data = await response.json();
        const time = new Date().toLocaleTimeString();

        // Hiển thị dữ liệu lên giao diện
        document.getElementById("tempValue").innerHTML = `${data.temperature}°C <i class="fas fa-thermometer-half"></i>`;
        document.getElementById("humidityValue").innerHTML = `${data.humidity}% <i class="fas fa-tint"></i>`;
        document.getElementById("soilValue").innerHTML = `${data.soil}% <i class="fas fa-seedling"></i>`;
        document.getElementById("lightValue").innerHTML = `${data.light} lux <i class="fas fa-sun"></i>`;

        // Cập nhật biểu đồ
        labels.push(time);
        sensorChart.data.datasets[0].data.push(data.temperature);
        sensorChart.data.datasets[1].data.push(data.humidity);
        sensorChart.data.datasets[2].data.push(data.soil);
        sensorChart.data.datasets[3].data.push(data.light);

        // Giữ tối đa 10 điểm dữ liệu
        if (labels.length > maxDataPoints) {
            labels.shift();
            sensorChart.data.datasets.forEach(dataset => dataset.data.shift());
        }

        sensorChart.update();
    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu cảm biến:", error);
        showErrorMessage("Không thể lấy dữ liệu cảm biến. Vui lòng kiểm tra kết nối.");
    }
}

// Hàm gửi lệnh điều khiển thiết bị (LED hoặc Bơm)
async function controlDevice(device, currentState, elementId) {
    const newState = currentState === "ON" ? "OFF" : "ON";
    
    try {
        const response = await fetch(controlUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device, status: newState }),
        });

        if (!response.ok) throw new Error("Không thể gửi lệnh điều khiển!");

        // Cập nhật trạng thái thiết bị sau khi lệnh được gửi thành công
        document.getElementById(elementId).textContent = newState === "ON" ? "Bật" : "Tắt";

        return newState;
    } catch (error) {
        console.error(`Lỗi khi điều khiển ${device}:`, error);
        showErrorMessage(`Không thể điều khiển ${device}. Vui lòng kiểm tra kết nối.`);
        return currentState; // Giữ trạng thái cũ nếu có lỗi
    }
}

// Hàm bật/tắt LED
async function toggleLed() {
    ledState = await controlDevice("light", ledState, "ledStatus");
}

// Hàm bật/tắt Bơm
async function togglePump() {
    pumpState = await controlDevice("pump", pumpState, "pumpStatus");
}


// Lắng nghe sự kiện nhấn nút
document.getElementById("btnLedControl").addEventListener("click", toggleLed);
document.getElementById("btnPumpControl").addEventListener("click", togglePump);

// Hàm hiển thị thông báo lỗi
function showErrorMessage(message) {
    const errorMessageElement = document.getElementById("errorMessage");
    errorMessageElement.textContent = message;
    errorMessageElement.style.display = "block"; // Hiển thị thông báo lỗi
    setTimeout(() => {
        errorMessageElement.style.display = "none"; // Ẩn thông báo sau 5 giây
    }, 5000);
}

// Gọi cập nhật dữ liệu cảm biến mỗi 5 giây
setInterval(updateData, 5000);

// Tải dữ liệu ngay khi trang load
window.onload = updateData;
