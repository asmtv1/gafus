export interface CSRFContextType {
    token: string | null;
    loading: boolean;
    refreshToken: () => void;
}
