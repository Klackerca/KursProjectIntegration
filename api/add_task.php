<?php
require_once __DIR__ . '/../includes/functions.php';

$input = json_decode(file_get_contents('php://input'), true);

requireFields($input, ['user_id', 'text', 'date', 'calendar_id']);

$pdo = getDB();

// Проверяем права доступа
$sql = "SELECT c.owner_id, cm.can_edit, cm.is_blocked
        FROM calendars c
        LEFT JOIN calendar_members cm ON c.id = cm.calendar_id AND cm.user_id = :user_id
        WHERE c.id = :calendar_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':user_id' => $input['user_id'],
    ':calendar_id' => $input['calendar_id']
]);
$calendar = $stmt->fetch();

if (!$calendar) {
    sendJsonResponse(['error' => 'Calendar not found'], 404);
}

// Проверяем права на редактирование
$isOwner = $calendar['owner_id'] == $input['user_id'];
$canEdit = $isOwner || ($calendar['can_edit'] && !$calendar['is_blocked']);

if (!$canEdit) {
    sendJsonResponse(['error' => 'No permission to add tasks'], 403);
}

$taskTime = !empty($input['task_time']) ? $input['task_time'] : null;
$taskTimeEnd = !empty($input['task_time_end']) ? $input['task_time_end'] : null;

$sql = "INSERT INTO tasks (calendar_id, user_id, task_text, task_date, task_time, task_time_end) 
        VALUES (:calendar_id, :user_id, :task_text, :task_date, :task_time, :task_time_end)";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':calendar_id' => $input['calendar_id'],
    ':user_id' => $input['user_id'],
    ':task_text' => $input['text'],
    ':task_date' => $input['date'],
    ':task_time' => $taskTime,
    ':task_time_end' => $taskTimeEnd
]);

$taskId = $pdo->lastInsertId();

sendJsonResponse([
    'status' => 'success',
    'task_id' => $taskId,
    'message' => 'Task created'
]);
?>