<?php
// Получение настроек уведомлений пользователя для календаря
require_once '../config/database.php';

$user_id = isset($_GET['user_id']) ? intval($_GET['user_id']) : 0;
$calendar_id = isset($_GET['calendar_id']) ? intval($_GET['calendar_id']) : 0;

if (!$user_id || !$calendar_id) {
    echo json_encode(['error' => 'Missing user_id or calendar_id']);
    exit;
}


$pdo = getDB();
try {
    $sql = "SELECT day_before, hour_before, ten_min_before FROM notification_settings WHERE user_id = ? AND calendar_id = ? LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$user_id, $calendar_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        echo json_encode($row);
    } else {
        echo json_encode(['day_before' => 0, 'hour_before' => 0, 'ten_min_before' => 0]);
    }
} catch (PDOException $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
