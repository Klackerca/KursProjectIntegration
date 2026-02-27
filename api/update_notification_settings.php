<?php
// Сохранение настроек уведомлений пользователя для календаря
require_once '../config/database.php';

$data = json_decode(file_get_contents('php://input'), true);
$user_id = isset($data['user_id']) ? intval($data['user_id']) : 0;
$calendar_id = isset($data['calendar_id']) ? intval($data['calendar_id']) : 0;
$day_before = isset($data['day_before']) ? intval($data['day_before']) : 0;
$hour_before = isset($data['hour_before']) ? intval($data['hour_before']) : 0;
$ten_min_before = isset($data['ten_min_before']) ? intval($data['ten_min_before']) : 0;

if (!$user_id || !$calendar_id) {
    echo json_encode(['status' => 'error', 'error' => 'Missing user_id or calendar_id']);
    exit;
}


$pdo = getDB();
try {
    $sql = "REPLACE INTO notification_settings (user_id, calendar_id, day_before, hour_before, ten_min_before) VALUES (?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);
    $result = $stmt->execute([$user_id, $calendar_id, $day_before, $hour_before, $ten_min_before]);
    if ($result) {
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'error' => 'DB error']);
    }
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
}
