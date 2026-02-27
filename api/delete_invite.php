<?php
require_once __DIR__ . '/../includes/functions.php';

$input = json_decode(file_get_contents('php://input'), true);

requireFields($input, ['invite_id', 'user_id']);

$pdo = getDB();

// Проверяем права доступа
$sql = "SELECT ci.id, ci.calendar_id, c.owner_id 
        FROM calendar_invites ci
        JOIN calendars c ON ci.calendar_id = c.id
        WHERE ci.id = :invite_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([':invite_id' => $input['invite_id']]);
$invite = $stmt->fetch();

if (!$invite) {
    sendJsonResponse(['error' => 'Invite not found'], 404);
}

if ($invite['owner_id'] != $input['user_id']) {
    sendJsonResponse(['error' => 'Access denied'], 403);
}

// Деактивируем приглашение
$sql = "UPDATE calendar_invites SET is_active = 0 WHERE id = :invite_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([':invite_id' => $input['invite_id']]);

sendJsonResponse(['status' => 'success', 'message' => 'Invite deleted']);

