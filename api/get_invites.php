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

// Получаем все активные приглашения
$sql = "SELECT id, invite_code, invite_token, created_at, expires_at, is_active
        FROM calendar_invites
        WHERE calendar_id = :calendar_id AND is_active = 1
        ORDER BY created_at DESC";
$stmt = $pdo->prepare($sql);
$stmt->execute([':calendar_id' => $calendarId]);

$invites = [];
$botUsername = 'My_TestCalendar_bot';

// Определяем базовый URL
$protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$baseUrl = "{$protocol}://{$host}";

while ($row = $stmt->fetch()) {
    $invites[] = [
        'id' => (int)$row['id'],
        'code' => $row['invite_code'],
        'expires_at' => $row['expires_at'],
        'created_at' => $row['created_at']
    ];
}

sendJsonResponse(['invites' => $invites]);

