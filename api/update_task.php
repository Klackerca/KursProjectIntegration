<?php
require_once __DIR__ . '/../includes/functions.php';

$input = json_decode(file_get_contents('php://input'), true);

// Проверяем обязательные поля
requireFields($input, ['task_id', 'user_id']);

// Должно быть либо completed, либо text
if (!isset($input['completed']) && !isset($input['text'])) {
    sendJsonResponse(['error' => 'Either completed or text field is required'], 400);
}

$pdo = getDB();

// Проверяем права доступа через задачу
$sql = "SELECT t.calendar_id, t.user_id as task_owner, c.owner_id as calendar_owner, 
               cm.can_edit, cm.is_blocked
        FROM tasks t
        JOIN calendars c ON t.calendar_id = c.id
        LEFT JOIN calendar_members cm ON c.id = cm.calendar_id AND cm.user_id = :user_id
        WHERE t.id = :task_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':user_id' => $input['user_id'],
    ':task_id' => $input['task_id']
]);
$task = $stmt->fetch();

if (!$task) {
    sendJsonResponse(['error' => 'Task not found'], 404);
}

// Проверяем права на редактирование
$isOwner = $task['calendar_owner'] == $input['user_id'];
$canEdit = $isOwner || ($task['can_edit'] && !$task['is_blocked']);

// Пользователь может изменить статус своей задачи, даже если у него нет прав на редактирование календаря
$isTaskOwner = $task['task_owner'] == $input['user_id'];

// Обновляем либо статус выполнения, либо текст задачи
$updates = [];
$params = [':task_id' => $input['task_id']];

if (isset($input['completed'])) {
    // Для изменения статуса: либо есть права на редактирование, либо это своя задача
    $canUpdateStatus = $canEdit || $isTaskOwner;
    if (!$canUpdateStatus) {
        sendJsonResponse(['error' => 'No permission to update task status'], 403);
    }
    $updates[] = "completed = :completed";
    $params[':completed'] = $input['completed'] ? 1 : 0;
}

if (isset($input['text']) && !empty(trim($input['text']))) {
    // Для редактирования текста: нужны права на редактирование календаря
    if (!$canEdit) {
        sendJsonResponse(['error' => 'No permission to edit task text'], 403);
    }
    $updates[] = "task_text = :task_text";
    $params[':task_text'] = trim($input['text']);
}

if (isset($input['task_time'])) {
    if (!$canEdit) {
        sendJsonResponse(['error' => 'No permission to edit task'], 403);
    }
    $updates[] = "task_time = :task_time";
    $params[':task_time'] = !empty($input['task_time']) ? $input['task_time'] : null;
}

if (isset($input['task_time_end'])) {
    if (!$canEdit) {
        sendJsonResponse(['error' => 'No permission to edit task'], 403);
    }
    $updates[] = "task_time_end = :task_time_end";
    $params[':task_time_end'] = !empty($input['task_time_end']) ? $input['task_time_end'] : null;
}

if (empty($updates)) {
    sendJsonResponse(['error' => 'No fields to update'], 400);
}

$sql = "UPDATE tasks SET " . implode(', ', $updates) . " WHERE id = :task_id";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);

sendJsonResponse(['status' => 'success']);
?>