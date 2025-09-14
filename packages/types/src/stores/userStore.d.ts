import type { UserProfile, UpdateUserProfileInput } from "../data/user";
export interface UserPreferences {
    notifications: {
        push: boolean;
        email: boolean;
        sms: boolean;
    };
    sound: {
        enabled: boolean;
        volume: number;
        trainingSounds: boolean;
        achievementSounds: boolean;
    };
    interface: {
        autoPlay: boolean;
        showProgress: boolean;
        showTips: boolean;
        compactMode: boolean;
    };
    privacy: {
        showProfile: boolean;
        showProgress: boolean;
        allowAnalytics: boolean;
    };
}
export interface User {
    id: string;
    username: string;
    phone: string;
    role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
    isConfirmed: boolean;
    avatarUrl?: string | null;
    createdAt: Date;
    updatedAt: Date;
}
export interface UserState {
    user: User | null;
    profile: UserProfile | null;
    preferences: UserPreferences;
    isLoading: boolean;
    isUpdating: boolean;
    isUpdatingPreferences: boolean;
    error: string | null;
    profileError: string | null;
    preferencesError: string | null;
    lastFetched: number | null;
    preferencesLastFetched: number | null;
    setUser: (user: User | null) => void;
    setProfile: (profile: UserProfile | null) => void;
    setPreferences: (preferences: Partial<UserPreferences>) => void;
    fetchProfile: () => Promise<void>;
    fetchPreferences: () => Promise<void>;
    updateProfile: (data: UpdateUserProfileInput) => Promise<void>;
    updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
    clearUser: () => void;
    clearError: () => void;
    clearProfileError: () => void;
    clearPreferencesError: () => void;
    isProfileLoaded: () => boolean;
    isPreferencesLoaded: () => boolean;
    hasProfile: () => boolean;
    getUserDisplayName: () => string;
}
export declare const DEFAULT_USER_PREFERENCES: UserPreferences;
export declare const CACHE_DURATION: number;
export declare const PREFERENCES_CACHE_DURATION: number;
//# sourceMappingURL=userStore.d.ts.map