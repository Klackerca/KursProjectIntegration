<?php
require_once __DIR__ . '/../includes/functions.php';

$input = json_decode(file_get_contents('php://input'), true);

requireFields($input, ['user_id', 'name']);

$pdo = getDB();

// Проверяем, что пользователь существует
$userCheck = $pdo->prepare("SELECT user_id FROM users WHERE user_id = :user_id");
$userCheck->execute([':user_id' => $input['user_id']]);
if (!$userCheck->fetch()) {
    sendJsonResponse(['error' => 'User not found'], 404);
}

// Создаем календарь
$sql = "INSERT INTO calendars (name, owner_id) VALUES (:name, :owner_id)";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':name' => $input['name'],
    ':owner_id' => $input['user_id']
]);

$calendarId = $pdo->lastInsertId();

// Автоматически добавляем владельца как участника с правами редактирования
$sql = "INSERT INTO calendar_members (calendar_id, user_id, can_edit) 
        VALUES (:calendar_id, :user_id, 1)
        ON DUPLICATE KEY UPDATE can_edit = 1, is_blocked = 0";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':calendar_id' => $calendarId,
    ':user_id' => $input['user_id']
]);

sendJsonResponse([
    'status' => 'success',
    'calendar_id' => (int)$calendarId,
    'message' => 'Calendar created'
]);

