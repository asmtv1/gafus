declare module "next-auth" {
  interface Session {
    user: {
      avatarUrl?: string | null;
      id: string;
      username: string;
    };
  }

  interface User {
    id: string;
    username: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
  }
}
export {};
