<?php
// Страница для присоединения к календарю по ссылке
require_once __DIR__ . '/includes/functions.php';

$token = $_GET['token'] ?? null;
$code = $_GET['code'] ?? null;

if (!$token && !$code) {
    header('Location: /');
    exit;
}

// Если есть токен или код, обрабатываем через API
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Присоединение к календарю</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <link rel="stylesheet" href="/static/style.css">
    <base href="/">
</head>
<body>
    <div class="app">
        <div style="text-align: center; padding: 40px 20px;">
            <h2>Присоединение к календарю...</h2>
            <p id="status">Обработка запроса...</p>
        </div>
    </div>
    
    <script>
        (async function() {
            const tg = window.Telegram?.WebApp;
            if (!tg || !tg.initData) {
                document.getElementById('status').textContent = 'Ошибка: приложение должно быть открыто через Telegram';
                return;
            }

            tg.ready();
            tg.expand();

            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            const code = urlParams.get('code');

            try {
                // Сначала аутентифицируемся
                const authResponse = await fetch('/api/auth.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData: tg.initData })
                });
                
                const authData = await authResponse.json();
                
                if (authData.status !== 'success') {
                    document.getElementById('status').textContent = 'Ошибка аутентификации';
                    return;
                }

                // Присоединяемся к календарю
                const joinResponse = await fetch('/api/join_calendar.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: authData.user_id,
                        token: token,
                        code: code
                    })
                });

                const joinData = await joinResponse.json();
                
                if (joinData.status === 'success') {
                    document.getElementById('status').textContent = 'Вы успешно присоединились к календарю!';
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 2000);
                } else {
                    document.getElementById('status').textContent = 'Ошибка: ' + (joinData.error || 'Неизвестная ошибка');
                }
            } catch (error) {
                console.error('Join error:', error);
                document.getElementById('status').textContent = 'Ошибка соединения с сервером';
            }
        })();
    </script>
</body>
</html>

