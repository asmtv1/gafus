// Типы для User Store
// Константы
export const DEFAULT_USER_PREFERENCES = {
    notifications: {
        push: true,
        email: false,
        sms: false,
    },
    sound: {
        enabled: true,
        volume: 0.7,
        trainingSounds: true,
        achievementSounds: true,
    },
    interface: {
        autoPlay: false,
        showProgress: true,
        showTips: true,
        compactMode: false,
    },
    privacy: {
        showProfile: true,
        showProgress: true,
        allowAnalytics: true,
    },
};
export const CACHE_DURATION = 5 * 60 * 1000; // 5 минут
export const PREFERENCES_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 часа
