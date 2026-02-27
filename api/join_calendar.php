<?php
require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJsonResponse(['error' => 'Invalid JSON request'], 400);
    }

    // Можно присоединиться по коду или токену
    $code = isset($input['code']) ? trim($input['code']) : null;
    $token = $input['token'] ?? null;
    $userId = isset($input['user_id']) ? (int)$input['user_id'] : null;

    if (!$userId) {
        sendJsonResponse(['error' => 'User ID required', 'message' => 'Требуется идентификатор пользователя.'], 400);
    }

    if (!$code && !$token) {
        sendJsonResponse(['error' => 'Code or token required', 'message' => 'Укажите код или ссылку приглашения.'], 400);
    }

    $pdo = getDB();

// Находим приглашение (код в БД хранится в верхнем регистре)
if ($code) {
    $codeUpper = strtoupper($code);
    $sql = "SELECT ci.*, c.owner_id 
            FROM calendar_invites ci
            JOIN calendars c ON ci.calendar_id = c.id
            WHERE ci.invite_code = :code AND ci.is_active = 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':code' => $codeUpper]);
} else {
    $sql = "SELECT ci.*, c.owner_id 
            FROM calendar_invites ci
            JOIN calendars c ON ci.calendar_id = c.id
            WHERE ci.invite_token = :token AND ci.is_active = 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':token' => $token]);
}

$invite = $stmt->fetch();

if (!$invite) {
    sendJsonResponse([
        'error' => 'Invalid invite code or token',
        'message' => 'Неверный код приглашения или приглашение отключено.'
    ], 404);
}

// Проверяем срок действия
if ($invite['expires_at'] && strtotime($invite['expires_at']) < time()) {
    sendJsonResponse([
        'error' => 'Invite expired',
        'message' => 'Срок действия приглашения истёк.'
    ], 400);
}

// Проверяем, не является ли пользователь уже владельцем
if ($invite['owner_id'] == $userId) {
    sendJsonResponse([
        'error' => 'You are already the owner of this calendar',
        'message' => 'Вы уже являетесь владельцем этого календаря.'
    ], 400);
}

// Проверяем, не является ли пользователь уже участником
$checkMember = $pdo->prepare("SELECT id, is_blocked FROM calendar_members 
                               WHERE calendar_id = :calendar_id AND user_id = :user_id");
$checkMember->execute([
    ':calendar_id' => $invite['calendar_id'],
    ':user_id' => $userId
]);
$member = $checkMember->fetch();

if ($member) {
    if ($member['is_blocked']) {
        sendJsonResponse([
            'error' => 'You are blocked from this calendar',
            'message' => 'Вы заблокированы в этом календаре.'
        ], 403);
    }
    sendJsonResponse([
        'error' => 'You are already a member',
        'message' => 'Вы уже являетесь участником этого календаря.'
    ], 400);
}

// Добавляем пользователя в календарь (только просмотр по умолчанию)
$sql = "INSERT INTO calendar_members (calendar_id, user_id, can_edit, is_blocked) 
        VALUES (:calendar_id, :user_id, 0, 0)";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':calendar_id' => $invite['calendar_id'],
    ':user_id' => $userId
]);

sendJsonResponse([
    'status' => 'success',
    'calendar_id' => (int)$invite['calendar_id'],
    'message' => 'Successfully joined calendar'
]);

} catch (Exception $e) {
    error_log('join_calendar error: ' . $e->getMessage());
    error_log('join_calendar trace: ' . $e->getTraceAsString());
    sendJsonResponse([
        'error' => 'Server error: ' . $e->getMessage(),
        'message' => 'Ошибка сервера. Попробуйте позже.'
    ], 500);
}
