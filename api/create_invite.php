<?php
require_once __DIR__ . '/../includes/functions.php';

$input = json_decode(file_get_contents('php://input'), true);

requireFields($input, ['calendar_id', 'user_id']);

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

// Генерируем короткий код (6-8 символов)
function generateShortCode($length = 8) {
    $characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Исключаем похожие символы
    $code = '';
    for ($i = 0; $i < $length; $i++) {
        $code .= $characters[random_int(0, strlen($characters) - 1)];
    }
    return $code;
}

// Генерируем уникальный код
do {
    $inviteCode = generateShortCode(8);
    $check = $pdo->prepare("SELECT id FROM calendar_invites WHERE invite_code = :code");
    $check->execute([':code' => $inviteCode]);
} while ($check->fetch());

// Генерируем токен для прямой ссылки
$inviteToken = bin2hex(random_bytes(32));

// Создаем приглашение
$expiresAt = isset($input['expires_days']) 
    ? date('Y-m-d H:i:s', strtotime('+' . $input['expires_days'] . ' days'))
    : null;

$sql = "INSERT INTO calendar_invites (calendar_id, invite_code, invite_token, created_by, expires_at) 
        VALUES (:calendar_id, :invite_code, :invite_token, :created_by, :expires_at)";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':calendar_id' => $input['calendar_id'],
    ':invite_code' => $inviteCode,
    ':invite_token' => $inviteToken,
    ':created_by' => $input['user_id'],
    ':expires_at' => $expiresAt
]);

$inviteId = $pdo->lastInsertId();

// Формируем ссылку для бота
$botUsername = 'My_TestCalendar_bot';
$botLink = "https://t.me/{$botUsername}?start=join_{$inviteCode}";

// Формируем прямую ссылку для веб-приложения
// Определяем базовый URL из запроса
$protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$baseUrl = "{$protocol}://{$host}";
$webAppLink = "{$baseUrl}/join?token={$inviteToken}";

sendJsonResponse([
    'status' => 'success',
    'invite' => [
        'id' => (int)$inviteId,
        'code' => $inviteCode,
        'expires_at' => $expiresAt
    ]
]);

