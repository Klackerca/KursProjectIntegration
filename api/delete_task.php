<?php
require_once __DIR__ . '/../includes/functions.php';

$input = json_decode(file_get_contents('php://input'), true);

requireFields($input, ['task_id', 'user_id']);

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

// Проверяем права на удаление
$isOwner = $task['calendar_owner'] == $input['user_id'];
$canEdit = $isOwner || ($task['can_edit'] && !$task['is_blocked']);

// Можно удалить свою задачу или быть владельцем календаря
$canDelete = $canEdit || ($task['task_owner'] == $input['user_id']);

if (!$canDelete) {
    sendJsonResponse(['error' => 'No permission to delete task'], 403);
}

$sql = "DELETE FROM tasks WHERE id = :task_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([':task_id' => $input['task_id']]);

sendJsonResponse(['status' => 'success', 'message' => 'Task deleted']);
?>