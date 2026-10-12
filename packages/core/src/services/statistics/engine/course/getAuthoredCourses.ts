import { prisma } from "@gafus/prisma";
import { TrainingStatus, type AuthoredCourse, type RawCourseData } from "@gafus/types";

export async function getAuthoredCoursesWithStats(authorId: string): Promise<AuthoredCourse[]> {
  if (!authorId) {
    throw new Error("Author ID is required to load authored courses statistics");
  }

  const courses = await prisma.course.findMany({
    where: { authorId },
    select: {
      id: true,
      name: true,
      logoImg: true,
      avgRating: true,
      reviews: {
        select: {
          rating: true,
          comment: true,
          createdAt: true,
          user: {
            select: {
              username: true,
              profile: {
                select: {
                  avatarUrl: true,
                },
              },
            },
          },
        },
      },
      userCourses: {
        select: {
          userId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          user: {
            select: {
              username: true,
              profile: {
                select: {
                  avatarUrl: true,
                },
              },
            },
          },
        },
      },
      dayLinks: {
        select: {
          id: true,
          order: true,
          day: {
            select: {
              id: true,
              title: true,
              stepLinks: {
                select: {
                  id: true,
                  order: true,
                  step: {
                    select: {
                      title: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const courseIds = courses.map((course) => course.id);
  const allTrainings =
    courseIds.length > 0
      ? await prisma.userTraining.findMany({
          where: {
            dayOnCourse: {
              courseId: { in: courseIds },
            },
          },
          select: {
            id: true,
            userId: true,
            status: true,
            createdAt: true,
            dayOnCourseId: true,
            dayOnCourse: {
              select: {
                id: true,
                courseId: true,
                order: true,
              },
            },
          },
        })
      : [];

  const allTrainingIds = allTrainings.map((training) => training.id);
  const allUserSteps =
    allTrainingIds.length > 0
      ? await prisma.userStep.findMany({
          where: {
            userTrainingId: { in: allTrainingIds },
          },
          select: {
            id: true,
            userTrainingId: true,
            stepOnDayId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [];

  const allUserIds = Array.from(new Set(allTrainings.map((training) => training.userId)));
  const userCourseUserIds = new Set<string>();
  courses.forEach((course) => {
    course.userCourses.forEach((userCourse) => userCourseUserIds.add(userCourse.userId));
  });

  const missingUserIds = allUserIds.filter((id) => !userCourseUserIds.has(id));
  const users =
    missingUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: missingUserIds } },
          select: {
            id: true,
            username: true,
            profile: {
              select: {
                avatarUrl: true,
              },
            },
          },
        })
      : [];

  const usersByUserId = new Map(users.map((user) => [user.id, user]));

  const trainingsByCourseId = new Map<string, typeof allTrainings>();
  allTrainings.forEach((training) => {
    const courseId = training.dayOnCourse.courseId;
    if (!trainingsByCourseId.has(courseId)) {
      trainingsByCourseId.set(courseId, []);
    }
    trainingsByCourseId.get(courseId)!.push(training);
  });

  const userStepsByTrainingId = new Map<string, typeof allUserSteps>();
  allUserSteps.forEach((userStep) => {
    if (!userStepsByTrainingId.has(userStep.userTrainingId)) {
      userStepsByTrainingId.set(userStep.userTrainingId, []);
    }
    userStepsByTrainingId.get(userStep.userTrainingId)!.push(userStep);
  });

  const activeStepsByUserId = new Map<
    string,
    {
      id: string;
      status: string;
      createdAt: Date;
      userTrainingId: string;
    }[]
  >();
  allUserSteps.forEach((userStep) => {
    if (
      userStep.status === TrainingStatus.IN_PROGRESS ||
      userStep.status === TrainingStatus.COMPLETED
    ) {
      const training = allTrainings.find((t) => t.id === userStep.userTrainingId);
      if (training) {
        if (!activeStepsByUserId.has(training.userId)) {
          activeStepsByUserId.set(training.userId, []);
        }
        activeStepsByUserId.get(training.userId)!.push(userStep);
      }
    }
  });

  for (const steps of activeStepsByUserId.values()) {
    steps.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const coursesWithStats: AuthoredCourse[] = courses.map((course: RawCourseData) => {
    const trainings = trainingsByCourseId.get(course.id) || [];
    const totalDaysInCourse = course.dayLinks.length;
    const uniqueUserIds = new Set(trainings.map((training) => training.userId));

    const allUsers = new Map<
      string,
      {
        userId: string;
        username: string;
        avatarUrl: string | null;
        startedAt: Date | null;
        completedAt: Date | null;
        status: TrainingStatus;
      }
    >();

    course.userCourses.forEach((userCourse) => {
      allUsers.set(userCourse.userId, {
        userId: userCourse.userId,
        username: userCourse.user.username,
        avatarUrl: userCourse.user.profile?.avatarUrl ?? null,
        startedAt: userCourse.startedAt,
        completedAt: userCourse.completedAt,
        status: userCourse.status as TrainingStatus,
      });
    });

    for (const [userId, userData] of allUsers.entries()) {
      const userActiveSteps = activeStepsByUserId.get(userId) || [];
      const userTrainings = trainings.filter((training) => training.userId === userId);
      const completedDays = userTrainings.filter(
        (training) => training.status === TrainingStatus.COMPLETED,
      ).length;
      const isCourseCompleted =
        completedDays === totalDaysInCourse &&
        userTrainings.length === totalDaysInCourse &&
        totalDaysInCourse > 0;

      if (isCourseCompleted) {
        userData.status = TrainingStatus.COMPLETED;
      } else if (userActiveSteps.length > 0) {
        const firstActiveStepDate = userActiveSteps[0]?.createdAt;
        if (
          firstActiveStepDate &&
          (!userData.startedAt || firstActiveStepDate < userData.startedAt)
        ) {
          userData.startedAt = firstActiveStepDate;
        }
        userData.status = TrainingStatus.IN_PROGRESS;
      } else {
        userData.status = TrainingStatus.NOT_STARTED;
        userData.startedAt = null;
      }
    }

    for (const userId of uniqueUserIds) {
      if (!allUsers.has(userId)) {
        const user = usersByUserId.get(userId);
        if (user) {
          const userTrainings = trainings.filter((training) => training.userId === userId);
          const userActiveSteps = activeStepsByUserId.get(userId) || [];
          const completedDays = userTrainings.filter(
            (training) => training.status === TrainingStatus.COMPLETED,
          ).length;
          const isCourseCompleted =
            completedDays === totalDaysInCourse &&
            userTrainings.length === totalDaysInCourse &&
            totalDaysInCourse > 0;

          let status: TrainingStatus = TrainingStatus.NOT_STARTED;
          let startedAt: Date | null = null;
          let completedAt: Date | null = null;

          if (isCourseCompleted) {
            status = TrainingStatus.COMPLETED;
            const lastCompletedTraining = userTrainings
              .filter((training) => training.status === TrainingStatus.COMPLETED)
              .sort(
                (a, b) =>
                  new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
              )[0];
            completedAt = lastCompletedTraining?.createdAt || new Date();
          } else if (userActiveSteps.length > 0) {
            status = TrainingStatus.IN_PROGRESS;
            startedAt = userActiveSteps[0]?.createdAt || null;
          }

          allUsers.set(userId, {
            userId,
            username: user.username,
            avatarUrl: user.profile?.avatarUrl ?? null,
            startedAt,
            completedAt,
            status,
          });
        }
      }
    }

    const daysByUserId = new Map<
      string,
      {
        dayOrder: number;
        dayTitle: string;
        status: TrainingStatus;
        steps: {
          stepOrder: number;
          stepTitle: string;
          status: TrainingStatus;
        }[];
      }[]
    >();

    const dayInfoMap = new Map(
      course.dayLinks.map((dayLink) => [
        dayLink.id,
        {
          title: dayLink.day.title,
          stepLinks: dayLink.day.stepLinks,
        },
      ]),
    );

    trainings.forEach((training) => {
      const userStepsForTraining = userStepsByTrainingId.get(training.id) || [];
      const stepStatusMap = new Map(
        userStepsForTraining.map((step) => [step.stepOnDayId, step.status]),
      );
      const dayInfo = dayInfoMap.get(training.dayOnCourseId);
      if (!dayInfo) return;

      const stepProgress = dayInfo.stepLinks.map((link) => ({
        stepOrder: link.order,
        stepTitle: link.step.title,
        status: (stepStatusMap.get(link.id) || TrainingStatus.NOT_STARTED) as TrainingStatus,
      }));

      const dayData = {
        dayOrder: training.dayOnCourse.order,
        dayTitle: dayInfo.title,
        status: training.status as TrainingStatus,
        steps: stepProgress,
      };

      if (!daysByUserId.has(training.userId)) {
        daysByUserId.set(training.userId, []);
      }
      daysByUserId.get(training.userId)!.push(dayData);
    });

    const userProgressArray = Array.from(allUsers.values());
    const usersWithProgress = userProgressArray.filter(
      (userCourse) => userCourse.status !== TrainingStatus.NOT_STARTED,
    );

    const totalStarted = usersWithProgress.length;
    const totalCompleted = usersWithProgress.filter(
      (userCourse) => userCourse.status === TrainingStatus.COMPLETED,
    ).length;
    const totalRatings = course.reviews.length;

    return {
      ...course,
      totalStarted,
      totalCompleted,
      totalRatings,
      userProgress: usersWithProgress.map((user) => {
        const userDays = daysByUserId.get(user.userId) || [];
        const activeDays = userDays.filter((day) => day.status !== TrainingStatus.NOT_STARTED);

        return {
          userId: user.userId,
          username: user.username,
          avatarUrl: user.avatarUrl,
          startedAt: user.startedAt,
          completedAt: user.completedAt,
          days: activeDays,
        };
      }),
    };
  });

  return coursesWithStats;
}
