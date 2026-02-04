// 定義 WebSocket 連線位址
const websocketUrl = `ws://${window.location.hostname}:81`; // ESP32 WebSocket 伺服器的位址 (Port 81)
let ws; // WebSocket 物件

// 取得 DOM 元素
const connectionStatusText = document.getElementById('connection-status-text');
const statusDisplay = document.getElementById('status-display');
const errorMessage = document.getElementById('error-message');

const joystickBase = document.getElementById('joystick-base');
const joystickHandle = document.getElementById('joystick-handle');
const joystickXDisplay = document.getElementById('joystick-x');
const joystickYDisplay = document.getElementById('joystick-y');

const servoMaxAngleInput = document.getElementById('servo-max-angle-input');
const setAngleButton = document.getElementById('set-angle-button');
const currentMaxAngleDisplay = document.getElementById('current-max-angle');

// 搖桿狀態變數
let isDragging = false;
let joystickCenterX = 0;
let joystickCenterY = 0;
let joystickRadius = 0;

// 儲存搖桿最後位置，用於避免重複發送
let lastJoystickX = 0;
let lastJoystickY = 0;

// WebSocket 連線初始化函數
function initWebSocket() {
    console.log('嘗試連線至 WebSocket...');
    connectionStatusText.textContent = '連線中...';
    statusDisplay.className = 'status-connecting';
    errorMessage.className = 'error-hidden'; // 隱藏錯誤訊息

    ws = new WebSocket(websocketUrl);

    ws.onopen = () => {
        console.log('WebSocket 連線成功！');
        connectionStatusText.textContent = '已連線';
        statusDisplay.className = 'status-connected';
        errorMessage.className = 'error-hidden';
    };

    ws.onmessage = (event) => {
        // 處理來自 ESP32 的訊息 (目前 ESP32 端未定義發送訊息，但可保留此處以備將來擴展)
        console.log('收到來自 ESP32 的訊息:', event.data);
    };

    ws.onclose = (event) => {
        console.log('WebSocket 連線關閉:', event.code, event.reason);
        connectionStatusText.textContent = '斷線';
        statusDisplay.className = 'status-disconnected';
        displayError('與 ESP32 的連線已斷開。請檢查 ESP32 是否正在運行並重新整理頁面。');
        // 嘗試重新連線
        setTimeout(initWebSocket, 5000); // 5秒後嘗試重新連線
    };

    ws.onerror = (error) => {
        console.error('WebSocket 錯誤:', error);
        // 連線錯誤通常會觸發 onclose，因此這裡只記錄
    };
}

// 顯示錯誤訊息
function displayError(message) {
    errorMessage.textContent = '錯誤: ' + message;
    errorMessage.className = 'error-visible';
}

// 發送搖桿數據到 ESP32
function sendJoystickData(x, y) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        // 僅當數據有變化時才發送，減少流量
        if (x !== lastJoystickX || y !== lastJoystickY) {
            const data = {
                type: 'joystick',
                x: x,
                y: y
            };
            ws.send(JSON.stringify(data));
            lastJoystickX = x;
            lastJoystickY = y;
        }
    } else {
        console.warn('WebSocket 未連線，無法發送搖桿數據。');
        displayError('WebSocket 未連線，無法發送搖桿數據。');
    }
}

// 搖桿事件處理：按下/觸摸開始
function onJoystickStart(e) {
    isDragging = true;
    joystickHandle.style.transition = 'none'; // 拖曳時移除動畫
    if (e.type === 'touchstart') {
        e.preventDefault(); // 防止觸摸滾動
    }
}

// 搖桿事件處理：移動
function onJoystickMove(e) {
    if (!isDragging) return;

    e.preventDefault(); // 防止滾動頁面

    let clientX, clientY;
    if (e.type === 'touchmove') {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    // 計算手把相對於搖桿基座中心的位置
    let deltaX = clientX - joystickCenterX;
    let deltaY = clientY - joystickCenterY;

    // 限制手把在圓形基座內
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > joystickRadius) {
        deltaX = (deltaX / distance) * joystickRadius;
        deltaY = (deltaY / distance) * joystickRadius;
    }

    // 更新手把位置
    joystickHandle.style.left = `${deltaX + joystickRadius}px`;
    joystickHandle.style.top = `${deltaY + joystickRadius}px`;

    // 將搖桿位置映射到 -100 到 100
    const mappedX = Math.round((deltaX / joystickRadius) * 100);
    const mappedY = Math.round((-deltaY / joystickRadius) * 100); // Y 軸反向，向上為正

    joystickXDisplay.textContent = mappedX;
    joystickYDisplay.textContent = mappedY;

    // 發送數據
    sendJoystickData(mappedX, mappedY);
}

// 搖桿事件處理：放開/觸摸結束
function onJoystickEnd() {
    isDragging = false;
    joystickHandle.style.transition = 'transform 0.2s ease-out'; // 恢復動畫
    // 將手把歸位
    joystickHandle.style.left = '50%';
    joystickHandle.style.top = '50%';
    joystickXDisplay.textContent = '0';
    joystickYDisplay.textContent = '0';
    // 發送搖桿歸位數據
    sendJoystickData(0, 0);
}

// 設定舵機角度函數
setAngleButton.addEventListener('click', () => {
    const angle = parseInt(servoMaxAngleInput.value);
    if (isNaN(angle) || angle < 0 || angle > 180) {
        alert('請輸入 0 到 180 之間的有效角度值！');
        return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        const data = {
            type: 'angle',
            value: angle
        };
        ws.send(JSON.stringify(data));
        currentMaxAngleDisplay.textContent = angle; // 更新顯示
        console.log('舵機最大角度設定為:', angle);
    } else {
        console.warn('WebSocket 未連線，無法設定角度。');
        displayError('WebSocket 未連線，無法設定角度。');
    }
});

// 頁面載入完成後執行
window.addEventListener('load', () => {
    // 初始化 WebSocket 連線
    initWebSocket();

    // 計算搖桿基座的中心點和半徑
    const rect = joystickBase.getBoundingClientRect();
    joystickCenterX = rect.left + rect.width / 2;
    joystickCenterY = rect.top + rect.height / 2;
    joystickRadius = rect.width / 2;

    // 添加搖桿事件監聽器
    joystickBase.addEventListener('mousedown', onJoystickStart);
    window.addEventListener('mousemove', onJoystickMove);
    window.addEventListener('mouseup', onJoystickEnd);

    joystickBase.addEventListener('touchstart', onJoystickStart, { passive: false });
    window.addEventListener('touchmove', onJoystickMove, { passive: false });
    window.addEventListener('touchend', onJoystickEnd);

    // 初始顯示當前角度 (從 input 的值)
    currentMaxAngleDisplay.textContent = servoMaxAngleInput.value;
});

// 重新計算搖桿中心和半徑，以適應視窗大小變化 (響應式設計)
window.addEventListener('resize', () => {
    const rect = joystickBase.getBoundingClientRect();
    joystickCenterX = rect.left + rect.width / 2;
    joystickCenterY = rect.top + rect.height / 2;
    joystickRadius = rect.width / 2;
});
