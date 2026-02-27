<?php
require_once __DIR__ . '/../includes/functions.php';

$userId = $_GET['user_id'] ?? null;

if (!$userId) {
    sendJsonResponse(['error' => 'User ID required'], 400);
}

$pdo = getDB();

// Получаем все календари пользователя (где он владелец или участник)
$sql = "SELECT DISTINCT c.id, c.name, c.owner_id, c.is_default, c.created_at,
               cm.can_edit, cm.is_blocked,
               (SELECT COUNT(*) FROM tasks WHERE calendar_id = c.id) as tasks_count
        FROM calendars c
        LEFT JOIN calendar_members cm ON c.id = cm.calendar_id AND cm.user_id = :user_id1
        WHERE c.owner_id = :user_id2 OR (cm.user_id = :user_id3 AND cm.is_blocked = 0)
        ORDER BY c.is_default DESC, c.created_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':user_id1' => $userId,
    ':user_id2' => $userId,
    ':user_id3' => $userId
]);

$calendars = [];
while ($row = $stmt->fetch()) {
    $calendars[] = [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'owner_id' => (int)$row['owner_id'],
        'is_default' => (bool)$row['is_default'],
        'is_owner' => (int)$row['owner_id'] == $userId,
        'can_edit' => (bool)($row['can_edit'] ?? ($row['owner_id'] == $userId)),
        'is_blocked' => (bool)($row['is_blocked'] ?? false),
        'tasks_count' => (int)$row['tasks_count'],
        'created_at' => $row['created_at']
    ];
}

sendJsonResponse(['calendars' => $calendars]);

