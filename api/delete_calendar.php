<?php
require_once __DIR__ . '/../includes/functions.php';

$input = json_decode(file_get_contents('php://input'), true);

requireFields($input, ['calendar_id', 'user_id']);

$pdo = getDB();

// Проверяем права доступа
$sql = "SELECT owner_id, is_default FROM calendars WHERE id = :calendar_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([':calendar_id' => $input['calendar_id']]);
$calendar = $stmt->fetch();

if (!$calendar) {
    sendJsonResponse(['error' => 'Calendar not found'], 404);
}

if ($calendar['owner_id'] != $input['user_id']) {
    sendJsonResponse(['error' => 'Access denied'], 403);
}

// Нельзя удалить дефолтный календарь
if ($calendar['is_default']) {
    sendJsonResponse(['error' => 'Cannot delete default calendar'], 400);
}

// Удаляем календарь (каскадное удаление через FOREIGN KEY)
$sql = "DELETE FROM calendars WHERE id = :calendar_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([':calendar_id' => $input['calendar_id']]);

sendJsonResponse(['status' => 'success', 'message' => 'Calendar deleted']);

