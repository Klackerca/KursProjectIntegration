<?php
require_once __DIR__ . '/../includes/functions.php';

$calendarId = $_GET['calendar_id'] ?? null;
$userId = $_GET['user_id'] ?? null;

if (!$calendarId || !$userId) {
    sendJsonResponse(['error' => 'Calendar ID and User ID required'], 400);
}

$pdo = getDB();

// Проверяем, что пользователь является владельцем календаря
$sql = "SELECT owner_id FROM calendars WHERE id = :calendar_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([':calendar_id' => $calendarId]);
$calendar = $stmt->fetch();

if (!$calendar) {
    sendJsonResponse(['error' => 'Calendar not found'], 404);
}

if ($calendar['owner_id'] != $userId) {
    sendJsonResponse(['error' => 'Access denied'], 403);
}

// Получаем всех участников календаря (исключая владельца)
$sql = "SELECT cm.user_id, cm.can_edit, cm.is_blocked, cm.joined_at,
               u.first_name, u.last_name, u.username
        FROM calendar_members cm
        JOIN users u ON cm.user_id = u.user_id
        WHERE cm.calendar_id = :calendar_id AND cm.user_id != :owner_id
        ORDER BY cm.joined_at DESC";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':calendar_id' => $calendarId,
    ':owner_id' => $userId
]);

$members = [];
while ($row = $stmt->fetch()) {
    $members[] = [
        'user_id' => (int)$row['user_id'],
        'first_name' => $row['first_name'],
        'last_name' => $row['last_name'],
        'username' => $row['username'],
        'can_edit' => (bool)$row['can_edit'],
        'is_blocked' => (bool)$row['is_blocked'],
        'joined_at' => $row['joined_at']
    ];
}

sendJsonResponse(['members' => $members]);

