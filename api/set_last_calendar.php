<?php
require_once __DIR__ . '/../includes/functions.php';

$input = json_decode(file_get_contents('php://input'), true);

requireFields($input, ['user_id', 'calendar_id']);

$pdo = getDB();

// Проверяем, что пользователь имеет доступ к календарю
$sql = "SELECT c.id FROM calendars c
        LEFT JOIN calendar_members cm ON c.id = cm.calendar_id AND cm.user_id = :user_id1
        WHERE c.id = :calendar_id 
        AND (c.owner_id = :user_id2 OR (cm.user_id = :user_id3 AND cm.is_blocked = 0))";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':user_id1' => $input['user_id'],
    ':user_id2' => $input['user_id'],
    ':user_id3' => $input['user_id'],
    ':calendar_id' => $input['calendar_id']
]);

if (!$stmt->fetch()) {
    sendJsonResponse(['error' => 'Access denied'], 403);
}

// Сохраняем последний открытый календарь
$sql = "INSERT INTO user_settings (user_id, last_calendar_id) 
        VALUES (:user_id, :calendar_id)
        ON DUPLICATE KEY UPDATE last_calendar_id = VALUES(last_calendar_id)";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':user_id' => $input['user_id'],
    ':calendar_id' => $input['calendar_id']
]);

sendJsonResponse(['status' => 'success', 'message' => 'Last calendar saved']);

