<?php
require_once __DIR__ . '/../config/database.php';

/**
 * Валидация данных от Telegram Mini App
 */
function validateTelegramData($initData) {
    try {
        // Декодируем URL-кодированные данные
        $initData = urldecode($initData);
        
        // Парсим строку
        parse_str($initData, $data);
        
        // Получаем hash из данных
        $receivedHash = $data['hash'] ?? null;
        if (!$receivedHash) {
            error_log("No hash in data");
            return null;
        }
        
        // Удаляем hash из данных для проверки
        unset($data['hash']);
        
        // Сортируем ключи
        ksort($data);
        
        // Создаем строку для проверки
        $checkStrings = [];
        foreach ($data as $key => $value) {
            $checkStrings[] = "$key=$value";
        }
        $dataCheckString = implode("\n", $checkStrings);
        
        // Создаем секретный ключ
        $secretKey = hash_hmac('sha256', BOT_TOKEN, "WebAppData", true);
        
        // Вычисляем хеш
        $computedHash = bin2hex(hash_hmac('sha256', $dataCheckString, $secretKey, true));
        
        // Сравниваем хеши
        if (hash_equals($receivedHash, $computedHash)) {
            return json_decode($data['user'] ?? '{}', true);
        } else {
            error_log("Hash validation failed. Received: $receivedHash, Computed: $computedHash");
            return null;
        }
        
    } catch (Exception $e) {
        error_log("Validation error: " . $e->getMessage());
        return null;
    }
}

/**
 * Упрощенная валидация для разработки (только для тестирования!)
 */
function validateTelegramDataSimple($initData) {
    try {
        $initData = urldecode($initData);
        parse_str($initData, $data);
        
        if (isset($data['user'])) {
            return json_decode($data['user'], true);
        }
        
        return null;
    } catch (Exception $e) {
        error_log("Simple validation error: " . $e->getMessage());
        return null;
    }
}

/**
 * Сохранение или обновление пользователя
 */
function saveUser($userData) {
    try {
        $pdo = getDB();
        
        $sql = "INSERT INTO users (user_id, first_name, last_name, username, last_login) 
                VALUES (:user_id, :first_name, :last_name, :username, NOW())
                ON DUPLICATE KEY UPDATE 
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                username = VALUES(username),
                last_login = NOW()";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':user_id' => $userData['id'],
            ':first_name' => $userData['first_name'] ?? null,
            ':last_name' => $userData['last_name'] ?? null,
            ':username' => $userData['username'] ?? null
        ]);
        
        return $userData['id'];
    } catch (Exception $e) {
        error_log("Save user error: " . $e->getMessage());
        throw $e;
    }
}

/**
 * Отправка JSON ответа
 */
function sendJsonResponse($data, $statusCode = 200) {
    // Очищаем любой предыдущий вывод
    if (ob_get_length()) {
        ob_clean();
    }
    
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    
    // В режиме разработки можно добавить больше информации об ошибках
    if (isset($data['error']) && $statusCode >= 400) {
        error_log("API Error ($statusCode): " . json_encode($data));
    }
    
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Проверка обязательных полей
 */
function requireFields($data, $fields) {
    foreach ($fields as $field) {
        // Для булевых полей (например, completed) проверяем только наличие ключа
        if ($field === 'completed') {
            if (!isset($data[$field])) {
                sendJsonResponse(['error' => "Missing required field: $field"], 400);
            }
        } else {
            // Для остальных полей проверяем наличие и непустоту
            if (!isset($data[$field]) || ($data[$field] !== 0 && $data[$field] !== false && empty($data[$field]))) {
                sendJsonResponse(['error' => "Missing required field: $field"], 400);
            }
        }
    }
}
?>