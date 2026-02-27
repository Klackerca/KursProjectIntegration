<?php
require_once __DIR__ . '/../includes/functions.php';

$userId = $_GET['user_id'] ?? null;

if (!$userId) {
    sendJsonResponse(['error' => 'User ID required'], 400);
}

$pdo = getDB();

// Получаем последний открытый календарь
$sql = "SELECT us.last_calendar_id, c.id, c.name, c.owner_id, c.is_default
        FROM user_settings us
        LEFT JOIN calendars c ON us.last_calendar_id = c.id
        WHERE us.user_id = :user_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([':user_id' => $userId]);
$setting = $stmt->fetch();

// Если нет сохраненного календаря, возвращаем дефолтный
if (!$setting || !$setting['last_calendar_id']) {
    $sql = "SELECT id, name, owner_id, is_default FROM calendars 
            WHERE owner_id = :user_id AND is_default = 1 
            LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':user_id' => $userId]);
    $default = $stmt->fetch();
    
    if ($default) {
        sendJsonResponse(['calendar_id' => (int)$default['id']]);
    } else {
        // Если нет дефолтного, возвращаем первый календарь пользователя
        $sql = "SELECT id FROM calendars WHERE owner_id = :user_id ORDER BY created_at LIMIT 1";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':user_id' => $userId]);
        $first = $stmt->fetch();
        
        if ($first) {
            sendJsonResponse(['calendar_id' => (int)$first['id']]);
        } else {
            sendJsonResponse(['calendar_id' => null]);
        }
    }
} else {
    sendJsonResponse(['calendar_id' => (int)$setting['last_calendar_id']]);
}

