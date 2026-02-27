# Настройка бота для обработки команды /join

## Как работает система приглашений

Пользователь получает уникальный код (например: `ABC12345`) и должен отправить боту команду:
```
/join ABC12345
```

## Что нужно реализовать в боте

Вам нужно добавить обработчик команды `/join` в вашего Telegram бота (@My_TestCalendar_bot).

### Пример реализации на Python (python-telegram-bot):

```python
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes
import requests

async def join_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /join"""
    if not context.args or len(context.args) == 0:
        await update.message.reply_text(
            "Использование: /join КОД\n\n"
            "Пример: /join ABC12345"
        )
        return
    
    invite_code = context.args[0].upper()
    user_id = update.effective_user.id
    
    # Отправляем запрос на ваш API
    try:
        response = requests.post(
            'https://ваш-домен.com/api/join_calendar.php',
            json={
                'user_id': user_id,
                'code': invite_code
            },
            headers={'Content-Type': 'application/json'}
        )
        
        data = response.json()
        
        if data.get('status') == 'success':
            await update.message.reply_text(
                f"✅ Вы успешно присоединились к календарю!\n\n"
                f"Откройте приложение для просмотра календаря."
            )
        else:
            error_msg = data.get('error', 'Неизвестная ошибка')
            await update.message.reply_text(f"❌ Ошибка: {error_msg}")
            
    except Exception as e:
        await update.message.reply_text(f"❌ Ошибка соединения с сервером")

# Регистрация обработчика
application.add_handler(CommandHandler("join", join_command))
```

### Пример реализации на Node.js (node-telegram-bot-api):

```javascript
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot('YOUR_BOT_TOKEN', {polling: true});

bot.onText(/\/join (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const inviteCode = match[1].toUpperCase();
    const userId = msg.from.id;
    
    try {
        const response = await axios.post('https://ваш-домен.com/api/join_calendar.php', {
            user_id: userId,
            code: inviteCode
        });
        
        if (response.data.status === 'success') {
            bot.sendMessage(chatId, 
                '✅ Вы успешно присоединились к календарю!\n\n' +
                'Откройте приложение для просмотра календаря.'
            );
        } else {
            bot.sendMessage(chatId, '❌ Ошибка: ' + (response.data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        bot.sendMessage(chatId, '❌ Ошибка соединения с сервером');
    }
});
```

## Важные моменты

1. **API endpoint**: `/api/join_calendar.php` принимает POST запрос с JSON:
   ```json
   {
     "user_id": 123456789,
     "code": "ABC12345"
   }
   ```

2. **Ответ API**:
   - Успех: `{"status": "success", "calendar_id": 1, "message": "Successfully joined calendar"}`
   - Ошибка: `{"error": "описание ошибки"}`

3. **Возможные ошибки**:
   - `Invalid invite code or token` - код не найден или неактивен
   - `Invite expired` - приглашение истекло
   - `You are already a member` - пользователь уже участник
   - `You are blocked from this calendar` - пользователь заблокирован

4. **Безопасность**: Убедитесь, что ваш API проверяет подлинность запросов от бота (можно использовать секретный токен).

