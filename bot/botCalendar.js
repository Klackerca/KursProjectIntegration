const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

const bot = new TelegramBot('8498231338:AAEsun1mwIrQ0ORwTL2S_1L66f1esbFT-k4', {polling: true});

// Настройки подключения к БД
const dbConfig = {
  user: process.env.DB_USER || 'Klacker_Calendar',
  password: '7|O=SRx|-Bi#]9LH',
  database: process.env.DB_NAME || 'Klacker_Calendar',
  socketPath: process.env.DB_SOCKET_PATH || '/var/run/mysqld/mysqld.sock'
};

const pool = mysql.createPool(dbConfig);

// Функция для отправки уведомлений
async function sendNotifications() {
    try {
        const connection = await pool.getConnection();
        
        // Получаем текущую дату и время
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
        
        // 1. Уведомления за день до
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDate = tomorrow.toISOString().split('T')[0];
        
        const [dayBeforeTasks] = await connection.execute(`
            SELECT t.*, u.chat_id, un.notification_type
            FROM tasks t
            JOIN user_notifications un ON t.user_id = un.user_id
            JOIN telegram_users u ON t.user_id = u.user_id
            WHERE t.task_date = ? 
            AND un.notification_type = 'day_before' 
            AND un.enabled = 1 
            AND t.completed = 0
            AND NOT EXISTS (
                SELECT 1 FROM sent_notifications sn 
                WHERE sn.task_id = t.id AND sn.notification_type = 'day_before'
            )
        `, [tomorrowDate]);
        
        for (const task of dayBeforeTasks) {
            const taskList = await getTasksForDay(connection, task.user_id, tomorrowDate);
            const message = `🔔 Напоминание: Завтра у вас ${taskList.length} задач(и):\n\n${taskList.map(t => `• ${t.title} в ${t.time_start || 'весь день'}`).join('\n')}`;
            
            await bot.sendMessage(task.chat_id, message);
            
            // Отмечаем как отправленное
            await connection.execute(`
                INSERT INTO sent_notifications (task_id, user_id, notification_type, sent_at)
                VALUES (?, ?, 'day_before', NOW())
            `, [task.id, task.user_id]);
        }
        
        // 2. Уведомления за час до
        const oneHourLater = new Date(now);
        oneHourLater.setHours(oneHourLater.getHours() + 1);
        const oneHourTime = oneHourLater.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
        
        const [hourBeforeTasks] = await connection.execute(`
            SELECT t.*, u.chat_id, un.notification_type
            FROM tasks t
            JOIN user_notifications un ON t.user_id = un.user_id
            JOIN telegram_users u ON t.user_id = u.user_id
            WHERE t.task_date = ? 
            AND t.task_time = ? 
            AND un.notification_type = 'hour_before' 
            AND un.enabled = 1 
            AND t.completed = 0
            AND NOT EXISTS (
                SELECT 1 FROM sent_notifications sn 
                WHERE sn.task_id = t.id AND sn.notification_type = 'hour_before'
            )
        `, [currentDate, oneHourTime]);
        
        for (const task of hourBeforeTasks) {
            const message = `⏰ Через час: ${task.title} в ${task.time_start}`;
            await bot.sendMessage(task.chat_id, message);
            
            await connection.execute(`
                INSERT INTO sent_notifications (task_id, user_id, notification_type, sent_at)
                VALUES (?, ?, 'hour_before', NOW())
            `, [task.id, task.user_id]);
        }
        
        // 3. Уведомления за 10 минут до
        const tenMinLater = new Date(now);
        tenMinLater.setMinutes(tenMinLater.getMinutes() + 10);
        const tenMinTime = tenMinLater.toTimeString().split(' ')[0].substring(0, 5);
        
        const [tenMinTasks] = await connection.execute(`
            SELECT t.*, u.chat_id, un.notification_type
            FROM tasks t
            JOIN user_notifications un ON t.user_id = un.user_id
            JOIN telegram_users u ON t.user_id = u.user_id
            WHERE t.task_date = ? 
            AND t.task_time = ? 
            AND un.notification_type = '10_min_before' 
            AND un.enabled = 1 
            AND t.completed = 0
            AND NOT EXISTS (
                SELECT 1 FROM sent_notifications sn 
                WHERE sn.task_id = t.id AND sn.notification_type = '10_min_before'
            )
        `, [currentDate, tenMinTime]);
        
        for (const task of tenMinTasks) {
            const message = `🚨 Через 10 минут: ${task.title} в ${task.time_start}`;
            await bot.sendMessage(task.chat_id, message);
            
            await connection.execute(`
                INSERT INTO sent_notifications (task_id, user_id, notification_type, sent_at)
                VALUES (?, ?, '10_min_before', NOW())
            `, [task.id, task.user_id]);
        }
        
        connection.release();
    } catch (error) {
        console.error('Error sending notifications:', error);
    }
}

// Вспомогательная функция для получения списка задач на день
async function getTasksForDay(connection, userId, date) {
    const [tasks] = await connection.execute(`
        SELECT * FROM tasks 
        WHERE user_id = ? AND task_date = ? AND completed = 0 
        ORDER BY task_time ASC
    `, [userId, date]);
    return tasks;
}

// Запускаем проверку уведомлений каждые 10 минут
setInterval(sendNotifications, 10 * 60 * 1000);

// Также запускаем сразу при старте
sendNotifications();

bot.onText(/\/join (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const inviteCode = match[1].toUpperCase();
    const userId = msg.from.id;
    
    // Сохраняем chat_id пользователя
    try {
        const connection = await pool.getConnection();
        await connection.execute(`
            INSERT INTO telegram_users (user_id, chat_id) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE chat_id = VALUES(chat_id)
        `, [userId, chatId]);
        connection.release();
    } catch (error) {
        console.error('Error saving chat_id:', error);
    }
    
    try {
        const response = await axios.post('https://sayanforce.ru/api/join_calendar.php', {
            user_id: userId,
            code: inviteCode
        }, {
            headers: { 'Content-Type': 'application/json' },
            validateStatus: function (status) {
                return status >= 200 && status < 600;
            },
            transformResponse: [(data) => {
                if (typeof data === 'string') {
                    try {
                        return JSON.parse(data);
                    } catch (e) {
                        return { error: 'Ошибка сервера', raw: data.substring(0, 200) };
                    }
                }
                return data;
            }]
        });
        
        if (response.status === 200 && response.data && response.data.status === 'success') {
            bot.sendMessage(chatId, 
                '✅ Вы успешно присоединились к календарю!\n\n' +
                'Откройте приложение для просмотра календаря.'
            );
        } else {
            // Ответ может быть объектом или строкой (HTML при ошибке PHP)
            const data = typeof response.data === 'object' ? response.data : {};
            const errorMsg = data.error || data.message || (typeof response.data === 'string' ? 'Ошибка сервера' : 'Неизвестная ошибка');
            
            console.log('Join API error response:', response.status, data);
            
            // Специальные сообщения для разных случаев
            if (String(errorMsg).toLowerCase().includes('owner')) {
                bot.sendMessage(chatId, 'ℹ️ Вы уже являетесь владельцем этого календаря.');
            } else if (String(errorMsg).toLowerCase().includes('already a member')) {
                bot.sendMessage(chatId, 'ℹ️ Вы уже являетесь участником этого календаря.');
            } else if (String(errorMsg).toLowerCase().includes('blocked')) {
                bot.sendMessage(chatId, '🚫 Вы заблокированы в этом календаре.');
            } else if (String(errorMsg).toLowerCase().includes('expired')) {
                bot.sendMessage(chatId, '⏰ Срок действия приглашения истек.');
            } else if (String(errorMsg).toLowerCase().includes('invalid') || String(errorMsg).toLowerCase().includes('code')) {
                bot.sendMessage(chatId, '❌ Неверный код приглашения. Проверьте правильность кода.');
            } else if (String(errorMsg).toLowerCase().includes('user id') || String(errorMsg).toLowerCase().includes('user_id')) {
                bot.sendMessage(chatId, '❌ Ошибка авторизации. Для начала зайдите в приложение и закройте его.');
            } else {
                // Показываем message (русский) если есть, иначе error
                const userMsg = data.message || errorMsg;
                bot.sendMessage(chatId, '❌ ' + userMsg);
            }
        }
    } catch (error) {
        console.error('Join error:', error);
        
        // Если есть response с ошибкой от сервера
        if (error.response && error.response.data) {
            const errorMsg = error.response.data.error || 'Неизвестная ошибка';
            bot.sendMessage(chatId, '❌ Ошибка: ' + errorMsg);
        } else if (error.request) {
            // Запрос был отправлен, но ответа не получено
            bot.sendMessage(chatId, '❌ Ошибка соединения с сервером. Попробуйте позже.');
        } else {
            // Ошибка при настройке запроса
            bot.sendMessage(chatId, '❌ Ошибка: ' + (error.message || 'Неизвестная ошибка'));
        }
    }
});