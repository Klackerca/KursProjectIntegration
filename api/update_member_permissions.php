<?php
require_once __DIR__ . '/../includes/functions.php';

$input = json_decode(file_get_contents('php://input'), true);

requireFields($input, ['calendar_id', 'user_id', 'member_user_id']);

$pdo = getDB();

// Проверяем, что пользователь является владельцем календаря
$sql = "SELECT owner_id FROM calendars WHERE id = :calendar_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([':calendar_id' => $input['calendar_id']]);
$calendar = $stmt->fetch();

if (!$calendar) {
    sendJsonResponse(['error' => 'Calendar not found'], 404);
}

if ($calendar['owner_id'] != $input['user_id']) {
    sendJsonResponse(['error' => 'Access denied'], 403);
}

// Нельзя изменять права владельца
if ($calendar['owner_id'] == $input['member_user_id']) {
    sendJsonResponse(['error' => 'Cannot modify owner permissions'], 400);
}

// Обновляем права участника
$canEdit = isset($input['can_edit']) ? (int)$input['can_edit'] : null;
$isBlocked = isset($input['is_blocked']) ? (int)$input['is_blocked'] : null;

$updates = [];
$params = [
    ':calendar_id' => $input['calendar_id'],
    ':member_user_id' => $input['member_user_id']
];

if ($canEdit !== null) {
    $updates[] = "can_edit = :can_edit";
    $params[':can_edit'] = $canEdit;
}

if ($isBlocked !== null) {
    $updates[] = "is_blocked = :is_blocked";
    $params[':is_blocked'] = $isBlocked;
}

if (empty($updates)) {
    sendJsonResponse(['error' => 'No updates provided'], 400);
}

$sql = "UPDATE calendar_members SET " . implode(', ', $updates) . 
       " WHERE calendar_id = :calendar_id AND user_id = :member_user_id";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);

sendJsonResponse(['status' => 'success', 'message' => 'Member permissions updated']);

