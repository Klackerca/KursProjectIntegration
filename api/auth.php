<?php
// Включаем отображение ошибок для отладки (в продакшене убрать)
error_reporting(E_ALL);
ini_set('display_errors', 0); // Не показываем ошибки пользователю, только логируем
ini_set('log_errors', 1);

require_once __DIR__ . '/../includes/functions.php';

// Логируем начало запроса
error_log("Auth API called: " . date('Y-m-d H:i:s'));

try {
    // Получаем данные из запроса
    $rawInput = file_get_contents('php://input');
    error_log("Raw input length: " . strlen($rawInput));
    
    $input = json_decode($rawInput, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        error_log("JSON decode error: " . json_last_error_msg());
        sendJsonResponse(['error' => 'Invalid JSON: ' . json_last_error_msg()], 400);
    }
    
    $initData = $input['initData'] ?? null;
    
    if (!$initData) {
        error_log("No initData provided");
        sendJsonResponse(['error' => 'No initData provided'], 400);
    }
    
    error_log("InitData received, length: " . strlen($initData));
    
    // Валидируем данные
    // Для разработки можно использовать упрощенную валидацию
    $userData = validateTelegramDataSimple($initData);
    
    // Если упрощенная валидация не сработала, пробуем полную
    if (!$userData) {
        $userData = validateTelegramData($initData);
    }
    
    if (!$userData) {
        error_log("Telegram data validation failed");
        sendJsonResponse(['error' => 'Invalid authentication data'], 401);
    }
    
    error_log("User validated: " . ($userData['id'] ?? 'unknown'));
} catch (Exception $e) {
    error_log("Error before auth: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['error' => 'Request processing error: ' . $e->getMessage()], 500);
}

try {
    // Сохраняем пользователя
    $userId = saveUser($userData);

    // Создаем дефолтный календарь для нового пользователя (если его еще нет)
    $pdo = getDB();
    $checkCalendar = $pdo->prepare("SELECT id FROM calendars WHERE owner_id = :user_id AND is_default = 1");
    $checkCalendar->execute([':user_id' => $userId]);

    if (!$checkCalendar->fetch()) {
        // Создаем дефолтный календарь
        $sql = "INSERT INTO calendars (name, owner_id, is_default) VALUES ('Мой календарь', :user_id, 1)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':user_id' => $userId]);
        $defaultCalendarId = $pdo->lastInsertId();
        
        // Автоматически добавляем владельца как участника
        $sql = "INSERT INTO calendar_members (calendar_id, user_id, can_edit) 
                VALUES (:calendar_id, :user_id, 1)
                ON DUPLICATE KEY UPDATE can_edit = 1, is_blocked = 0";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':calendar_id' => $defaultCalendarId,
            ':user_id' => $userId
        ]);
        
        // Сохраняем как последний открытый календарь
        $sql = "INSERT INTO user_settings (user_id, last_calendar_id) 
                VALUES (:user_id, :calendar_id)
                ON DUPLICATE KEY UPDATE last_calendar_id = VALUES(last_calendar_id)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':user_id' => $userId,
            ':calendar_id' => $defaultCalendarId
        ]);
    }
    
    sendJsonResponse([
        'status' => 'success',
        'user_id' => $userId,
        'first_name' => $userData['first_name'] ?? ''
    ]);
} catch (Exception $e) {
    error_log("Auth error: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
?>