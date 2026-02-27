<?php
require_once __DIR__ . '/../includes/functions.php';

$input = json_decode(file_get_contents('php://input'), true);

requireFields($input, ['calendar_id', 'user_id']);

$pdo = getDB();

// Проверяем, что пользователь не владелец
$sql = "SELECT owner_id FROM calendars WHERE id = :calendar_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([':calendar_id' => $input['calendar_id']]);
$calendar = $stmt->fetch();

if (!$calendar) {
    sendJsonResponse(['error' => 'Calendar not found'], 404);
}

if ($calendar['owner_id'] == $input['user_id']) {
    sendJsonResponse(['error' => 'Owner cannot leave own calendar'], 400);
}

// Удаляем участника
$sql = "DELETE FROM calendar_members WHERE calendar_id = :calendar_id AND user_id = :user_id";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':calendar_id' => $input['calendar_id'],
    ':user_id' => $input['user_id']
]);

if ($stmt->rowCount() === 0) {
    sendJsonResponse(['error' => 'Not a member of this calendar'], 400);
}

sendJsonResponse(['status' => 'success', 'message' => 'Left calendar']);
?>
