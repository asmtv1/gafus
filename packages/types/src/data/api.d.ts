export interface RawCourseData {
    id: string;
    name: string;
    logoImg: string;
    avgRating: number | null;
    reviews: {
        rating: number | null;
        comment: string | null;
        createdAt: Date;
        user: {
            username: string;
            profile: {
                avatarUrl: string | null;
            } | null;
        };
    }[];
    userCourses: {
        userId: string;
        status: string;
        startedAt: Date | null;
        completedAt: Date | null;
        user: {
            username: string;
            profile: {
                avatarUrl: string | null;
            } | null;
        };
    }[];
    dayLinks: {
        id: string;
        order: number;
        day: {
            id: string;
            title: string;
            stepLinks: {
                id: string;
                order: number;
                step: {
                    title: string;
                };
            }[];
        };
    }[];
}
export interface CourseWithExtras {
    id: string;
    name: string;
    type: string;
    description: string;
    shortDesc: string;
    duration: string;
    logoImg: string;
    isPrivate: boolean;
    isPaid: boolean;
    avgRating: number | null;
    trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
    createdAt: Date;
    author: {
        username: string;
    };
    reviews: {
        rating: number | null;
        comment: string | null;
        createdAt: Date;
        user: {
            id: string;
            username: string;
            profile: {
                avatarUrl: string | null;
            } | null;
        };
    }[];
    favoritedBy: {
        userId: string;
    }[];
    access: {
        userId: string;
        user: {
            id: string;
        };
    }[];
    userCourses: {
        userId: string;
        status: string;
        startedAt: Date | null;
        completedAt: Date | null;
        user: {
            username: string;
            profile: {
                avatarUrl: string | null;
            } | null;
        };
    }[];
    dayLinks: {
        order: number;
        day: {
            id: string;
            title: string;
            stepLinks: {
                id: string;
                order: number;
                step: {
                    title: string;
                };
            }[];
        };
    }[];
}
//# sourceMappingURL=api.d.ts.map