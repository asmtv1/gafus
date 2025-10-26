export interface UserSession {
    user?: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
        role?: string;
    };
}
