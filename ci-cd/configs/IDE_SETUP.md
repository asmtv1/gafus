# Настройка IDE для работы с GitHub

## 🔑 GitHub токен

Токен сохранен в файле `ci-cd/configs/github-token.env`:

```bash
GITHUB_TOKEN=your_github_token_here
```

## 🚀 Быстрая настройка

Запустите скрипт для автоматической настройки:

```bash
./ci-cd/scripts/setup-github-token.sh
```

## ⚙️ Ручная настройка

### 1. В терминале IDE

```bash
# Загрузить переменные окружения
source ci-cd/configs/github-token.env

# Настроить GitHub CLI
echo "$GITHUB_TOKEN" | gh auth login --with-token
```

### 2. В настройках IDE

Добавьте переменную окружения в настройки IDE:

- **Переменная:** `GITHUB_TOKEN`
- **Значение:** `your_github_token_here`

### 3. В .bashrc или .zshrc

```bash
# Добавить в ~/.bashrc или ~/.zshrc
export GITHUB_TOKEN="your_github_token_here"
```

## 🔒 Безопасность

⚠️ **Важно:** 
- Не коммитьте файл `github-token.env` в git
- Токен имеет права на чтение/запись репозитория и workflow'ы
- При компрометации токена - немедленно отзовите его в GitHub

## 📝 Проверка

```bash
# Проверить авторизацию
gh auth status

# Проверить доступ к репозиторию
gh repo view asmtv1/gafus

# Проверить workflow'ы
gh workflow list
```
