<?php
require_once __DIR__ . '/../includes/functions.php';

$userId = $_GET['user_id'] ?? null;
$calendarId = $_GET['calendar_id'] ?? null;
$date = $_GET['date'] ?? null;

if (!$userId || !$calendarId) {
    sendJsonResponse(['error' => 'User ID and Calendar ID required'], 400);
}

$pdo = getDB();

// Проверяем доступ к календарю
$sql = "SELECT c.owner_id, cm.can_edit, cm.is_blocked
        FROM calendars c
        LEFT JOIN calendar_members cm ON c.id = cm.calendar_id AND cm.user_id = :user_id
        WHERE c.id = :calendar_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':user_id' => $userId,
    ':calendar_id' => $calendarId
]);
$calendar = $stmt->fetch();

if (!$calendar) {
    sendJsonResponse(['error' => 'Calendar not found'], 404);
}

if ($calendar['owner_id'] != $userId && (!$calendar['can_edit'] || $calendar['is_blocked'])) {
    // Если пользователь не владелец и не имеет прав на редактирование, проверяем хотя бы членство
    if (!$calendar['can_edit'] && $calendar['is_blocked']) {
        sendJsonResponse(['error' => 'Access denied'], 403);
    }
}

// Получаем задачи календаря
if ($date) {
    $sql = "SELECT t.id, t.task_text, t.task_time, t.task_time_end, t.completed, t.task_date, t.user_id, u.first_name
            FROM tasks t
            JOIN users u ON t.user_id = u.user_id
            WHERE t.calendar_id = :calendar_id AND t.task_date = :date 
            ORDER BY t.task_time, t.created_at";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':calendar_id' => $calendarId,
        ':date' => $date
    ]);
} else {
    $sql = "SELECT t.id, t.task_text, t.task_time, t.task_time_end, t.completed, t.task_date, t.user_id, u.first_name
            FROM tasks t
            JOIN users u ON t.user_id = u.user_id
            WHERE t.calendar_id = :calendar_id 
            ORDER BY t.task_date DESC, t.task_time, t.created_at";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':calendar_id' => $calendarId]);
}

$tasks = [];
while ($row = $stmt->fetch()) {
    $tasks[] = [
        'id' => $row['id'],
        'text' => $row['task_text'],
        'task_time' => $row['task_time'],
        'task_time_end' => $row['task_time_end'],
        'completed' => (bool)$row['completed'],
        'date' => $row['task_date'],
        'user_id' => (int)$row['user_id'],
        'author_name' => $row['first_name']
    ];
}

sendJsonResponse(['tasks' => $tasks]);
?>