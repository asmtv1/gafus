# Prisma: полный список моделей, enum и полей

> Сгенерировано 2026-10-29 из исходников. Обновить: `python3 scripts/docs/generate_reference.py`. Инвентаризация не равна PASS тестов. Значения секретов не читаются.

Источник: [`packages/prisma/schema.prisma`](../../packages/prisma/schema.prisma) и каталог [`packages/prisma/migrations`](../../packages/prisma/migrations).

Количество моделей: **186**, enum: **70**.

### model `MediaCdnPurge`

`id: String`, `scope: String`, `paths: String[]`, `purgeOperations: String[]`, `status: String`, `availableAt: DateTime`, `attemptToken: String?`, `leaseUntil: DateTime?`, `attempts: Int`, `errorCode: String?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `AccountStorageCleanup`

`id: String`, `ownerId: String`, `scope: String`, `keys: String[]`, `prefixes: String[]`, `keyCursor: Int`, `status: String`, `purgeOperations: String[]`, `purgeAfter: DateTime?`, `attempts: Int`, `errorCode: String?`, `attemptToken: String?`, `leaseUntil: DateTime?`, `availableAt: DateTime`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `Course`

`id: String`, `name: String`, `type: String`, `description: String`, `equipment: String`, `trainingLevel: TrainingLevel`, `shortDesc: String`, `duration: String`, `logoImg: String`, `isPrivate: Boolean`, `isPaid: Boolean`, `authorId: String`, `avgRating: Float?`, `videoUrl: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `version: Int`, `showInProfile: Boolean`, `isPersonalized: Boolean`, `guideContent: String?`, `awards: Award[]`, `author: User`, `access: CourseAccess[]`, `reviews: CourseReview[]`, `surveyResponses: SurveyResponse[]`, `dayLinks: DayOnCourse[]`, `favoritedBy: FavoriteCourse[]`, `userCourses: UserCourse[]`

### model `TrainingDay`

`id: String`, `title: String`, `equipment: String`, `description: String`, `type: String`, `authorId: String`, `showCoursePathExport: Boolean`, `shareProgressAcrossCourses: Boolean`, `createdAt: DateTime`, `updatedAt: DateTime`, `dayLinks: DayOnCourse[]`, `diaryEntries: DiaryEntry[]`, `stepLinks: StepOnDay[]`, `author: User`

### model `Step`

`id: String`, `title: String`, `description: String`, `durationSec: Int?`, `type: StepType`, `imageUrls: String[]`, `pdfUrls: String[]`, `videoUrl: String?`, `checklist: Json?`, `requiresVideoReport: Boolean`, `requiresWrittenFeedback: Boolean`, `hasTestQuestions: Boolean`, `surveySlug: String?`, `isDailyCourse: Boolean`, `authorId: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `estimatedDurationSec: Int?`, `examResults: ExamResult[]`, `surveyResponses: SurveyResponse[]`, `author: User`, `dailyCourseBundleLinks: DailyCourseBundleStep[]`, `stepLinks: StepOnDay[]`

### model `StepCategory`

`id: String`, `name: String`, `description: String?`, `icon: String?`, `order: Int`, `createdAt: DateTime`, `updatedAt: DateTime`, `templates: StepTemplate[]`

### model `StepTemplate`

`id: String`, `title: String`, `description: String`, `durationSec: Int?`, `type: StepType`, `imageUrls: String[]`, `pdfUrls: String[]`, `videoUrl: String?`, `checklist: Json?`, `requiresVideoReport: Boolean`, `requiresWrittenFeedback: Boolean`, `hasTestQuestions: Boolean`, `surveySlug: String?`, `categoryId: String?`, `tags: String[]`, `isPublic: Boolean`, `usageCount: Int`, `authorId: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `estimatedDurationSec: Int?`, `author: User`, `category: StepCategory?`

### model `DayOnCourse`

`id: String`, `courseId: String`, `dayId: String`, `order: Int`, `course: Course`, `day: TrainingDay`, `userTrainings: UserTraining[]`

### model `DiaryEntry`

`id: String`, `userId: String`, `dayId: String`, `content: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `day: TrainingDay`, `user: User`

### model `StepOnDay`

`id: String`, `dayId: String`, `stepId: String`, `order: Int`, `day: TrainingDay`, `step: Step`, `userSteps: UserStep[]`

### model `DailyCourseBundle`

`id: String`, `title: String`, `equipment: String`, `description: String`, `type: String`, `authorId: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `author: User`, `schedules: DailyCourseSchedule[]`, `stepLinks: DailyCourseBundleStep[]`

### model `DailyCourseBundleStep`

`id: String`, `bundleId: String`, `stepId: String`, `order: Int`, `bundle: DailyCourseBundle`, `step: Step`, `dailyCourseUserSteps: DailyCourseUserStep[]`

### model `UserTraining`

`id: String`, `userId: String`, `dayOnCourseId: String`, `status: TrainingStatus`, `currentStepIndex: Int?`, `createdAt: DateTime`, `updatedAt: DateTime`, `steps: UserStep[]`, `dayOnCourse: DayOnCourse`, `user: User`

### model `UserStep`

`id: String`, `userTrainingId: String`, `stepOnDayId: String`, `status: TrainingStatus`, `paused: Boolean`, `remainingSec: Int?`, `createdAt: DateTime`, `updatedAt: DateTime`, `examResult: ExamResult?`, `stepOnDay: StepOnDay`, `userTraining: UserTraining`

### model `DailyCourseSchedule`

`id: String`, `date: DateTime`, `bundleId: String`, `createdById: String`, `isPublished: Boolean`, `createdAt: DateTime`, `updatedAt: DateTime`, `bundle: DailyCourseBundle`, `createdBy: User`, `userTrainings: DailyCourseUserTraining[]`

### model `DailyCourseUserTraining`

`id: String`, `userId: String`, `scheduleId: String`, `status: TrainingStatus`, `currentStepIndex: Int?`, `createdAt: DateTime`, `updatedAt: DateTime`, `schedule: DailyCourseSchedule`, `user: User`, `steps: DailyCourseUserStep[]`

### model `DailyCourseUserStep`

`id: String`, `dailyCourseUserTrainingId: String`, `bundleStepId: String`, `status: TrainingStatus`, `paused: Boolean`, `remainingSec: Int?`, `createdAt: DateTime`, `updatedAt: DateTime`, `dailyCourseUserTraining: DailyCourseUserTraining`, `bundleStep: DailyCourseBundleStep`, `examResult: ExamResult?`

### model `User`

`chat2CreatedConversations: Chat2Conversation[]`, `chat2Memberships: Chat2Member[]`, `chat2AuthoredMessages: Chat2Message[]`, `chat2MessageReactions: Chat2MessageReaction[]`, `chat2BlocksSent: Chat2Block[]`, `chat2BlocksReceived: Chat2Block[]`, `chat2PushReceipts: Chat2PushReceipt[]`, `chat2OwnedMedia: Chat2Media[]`, `chat2SubmittedReports: Chat2Report[]`, `petCreateReceipts: PetCreateReceipt[]`, `offlineMutationReceipts: OfflineMutationReceipt[]`, `offlineResourceRevisions: OfflineResourceRevision[]`, `feedBookmarks: FeedBookmark[]`, `feedPostFeedback: FeedUserPostFeedback[]`, `feedPersonalization: FeedPersonalizationPreference?`, `feedImpressions: FeedImpression[]`, `feedRankingEvents: FeedRankingEvent[]`, `feedAffinitiesAsViewer: FeedUserAuthorAffinity[]`, `feedAffinitiesAsAuthor: FeedUserAuthorAffinity[]`, `feedPreferences: FeedAuthorPreference[]`, `feedSubscribers: FeedAuthorPreference[]`, `feedPublishingBlocked: Boolean`, `feedPublishingBlockReason: String?`, `feedPosts: FeedPost[]`, `feedPollVotes: FeedPollVote[]`, `feedMediaAssets: FeedMediaAsset[]`, `feedUploads: FeedUpload[]`, `feedComments: FeedComment[]`, `feedPostReactions: FeedPostReaction[]`, `feedCommentReactions: FeedCommentReaction[]`, `feedPostViews: FeedPostView[]`, `feedNotifications: FeedNotification[]`, `galleryAlbums: GalleryAlbum[]`, `galleryPhotos: GalleryPhoto[]`, `galleryUploads: GalleryUpload[]`, `questions: Question[]`, `questionAnswers: QuestionAnswer[]`, `questionHearts: QuestionHeart[]`, `questionViews: QuestionView[]`, `questionPhotos: QuestionPhoto[]`, `questionReports: QuestionReport[]`, `questionBlock: QuestionBlock?`, `clientCynologistChat: CynologistChat?`, `trainerCynologistChats: CynologistChat[]`, `communityChatOperations: CommunityChatSendOperation[]`, `communityChatAttachments: CommunityChatAttachment[]`, `id: String`, `username: String`, `email: String?`, `phone: String?`, `appleAppAccountToken: String?`, `password: String`, `passwordSetAt: DateTime?`, `sessionsRevokedAt: DateTime?`, `onboardingTourCompletedAt: DateTime?`, `telegramId: String?`, `role: UserRole`, `registrationChannel: RegistrationChannel`, `passwordResetRequestedAt: DateTime?`, `accountDeletionRequestedAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `accounts: Account[]`, `sessions: Session[]`, `authoredCourses: Course[]`, `courseAccesses: CourseAccess[]`, `courseReviews: CourseReview[]`, `diaryEntries: DiaryEntry[]`, `diplomas: Diploma[]`, `reviewedExamResults: ExamResult[]`, `surveyResponses: SurveyResponse[]`, `favoriteCourses: FavoriteCourse[]`, `passwordResetTokens: PasswordResetToken[]`, `accountDeletionTokens: AccountDeletionToken[]`, `pets: Pet[]`, `petDocuments: PetDocument[]`, `emailChangeTokens: EmailChangeToken[]`, `pushSubscriptions: PushSubscription[]`, `reengagementCampaigns: ReengagementCampaign[]`, `reengagementSettings: ReengagementSettings?`, `refreshTokens: RefreshToken[]`, `reminders: Reminder[]`, `reminderMutationReceipts: ReminderMutationReceipt[]`, `createdSteps: Step[]`, `stepNotifications: StepNotification[]`, `createdStepTemplates: StepTemplate[]`, `trainerAIChats: TrainerAIChat[]`, `trainerAIConfig: TrainerAIConfig?`, `trainerNotes: TrainerNote[]`, `studentNotes: TrainerNoteStudent[]`, `trainerVideos: TrainerVideo[]`, `trainings: Training[]`, `trainingAccesses: TrainingAccess[]`, `createdDays: TrainingDay[]`, `dailyCourseBundles: DailyCourseBundle[]`, `userCourses: UserCourse[]`, `profile: UserProfile?`, `userTrainings: UserTraining[]`, `userVideoProgresses: UserVideoProgress[]`, `consentLogs: ConsentLog[]`, `petPreventionEntries: PetPreventionEntry[]`, `authoredArticles: Article[]`, `articleLikes: ArticleLike[]`, `articleViews: ArticleViewer[]`, `consultationCynologist: ConsultationCynologist?`, `consultationBookingsAsClient: ConsultationBooking[]`, `consultationBookingIdempotency: ConsultationBookingIdempotency[]`, `createdDailyCourseSchedules: DailyCourseSchedule[]`, `dailyCourseUserTrainings: DailyCourseUserTraining[]`, `appSubscriptions: AppSubscription[]`, `appSubscriptionPayments: AppSubscriptionPayment[]`, `appSubscriptionEvents: AppSubscriptionEvent[]`, `appSubscriptionTrials: AppSubscriptionTrial[]`, `manualAppSubscriptionGrants: AppSubscription[]`, `updatedAppSubscriptionSettings: AppSubscriptionSettings[]`, `adminAppSubscriptionEvents: AppSubscriptionEvent[]`, `createdAppSubscriptionPromoCodes: AppSubscriptionPromoCode[]`, `updatedAppSubscriptionPromoCodes: AppSubscriptionPromoCode[]`, `appSubscriptionPromoCodeEvents: AppSubscriptionPromoCodeEvent[]`, `profitVideoExpenses: ProfitVideoExpense[]`, `partnerProfile: PartnerProfile?`, `referredByPartner: PartnerReferral?`, `savedRegistrationPromoCodeId: String?`, `savedRegistrationPromoCode: AppSubscriptionPromoCode?`, `registrationEmailAttempts: RegistrationEmailAttempt[]`, `vkRegistrationContexts: VkRegistrationContext[]`, `vkRegistrationResults: VkRegistrationContext[]`, `vkLoginGrants: VkLoginGrant[]`, `rewardedCreditWallet: RewardedCreditWallet?`, `gafusWallet: GafusWallet?`, `gafusTransactions: GafusTransaction[]`, `gafusTransactionsAsAdmin: GafusTransaction[]`, `gafusRewardEvents: GafusRewardEvent[]`, `gafusTargetAccesses: GafusTargetAccess[]`, `gafusSettingsUpdated: GafusSettings[]`, `gafusSettingsRevisions: GafusSettingsRevision[]`, `gafusAdminAudits: GafusAdminAudit[]`, `rewardedAdSessions: RewardedAdSession[]`, `rewardedTargetAccesses: RewardedTargetAccess[]`, `vkIdOneTimeLogins: VkIdOneTimeLogin[]`, `rewardedCreditTransactions: RewardedCreditTransaction[]`, `updatedRewardedAdSettings: RewardedAdSettings[]`, `updatedMobileAppReleasePolicies: MobileAppReleasePolicy[]`, `mobileIntroAuthOutcomes: MobileIntroInstallation[]`, `registrationPending: Boolean`

### enum `MobileIntroPlatform`

`IOS`, `ANDROID`

### enum `MobileIntroCompletion`

`COMPLETED`, `SKIPPED`

### enum `MobileIntroAuthOutcome`

`REGISTERED`, `LOGGED_IN`

### model `MobileIntroInstallation`

`id: String`, `installationId: String`, `introVersion: String`, `platform: MobileIntroPlatform`, `openedAt: DateTime`, `receivedAt: DateTime`, `completion: MobileIntroCompletion?`, `completedAt: DateTime?`, `authOutcome: MobileIntroAuthOutcome?`, `authOutcomeAt: DateTime?`, `authOutcomeUserId: String?`, `authOutcomeUser: User?`, `createdAt: DateTime`, `updatedAt: DateTime`

### enum `ConsentType`

`PERSONAL_DATA`, `PRIVACY_POLICY`, `DATA_DISTRIBUTION`

### enum `ConsentLogStatus`

`PENDING`, `COMPLETED`, `FAILED`

### model `ConsentLog`

`id: String`, `tempSessionId: String`, `consentType: ConsentType`, `userId: String?`, `user: User?`, `consentVersion: String`, `consentText: Json?`, `consentDate: DateTime`, `ipAddress: String?`, `userAgent: String?`, `formData: Json?`, `status: ConsentLogStatus`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `TrainerVideo`

`id: String`, `trainerId: String`, `relativePath: String`, `originalName: String`, `mimeType: String`, `fileSize: BigInt`, `durationSec: Int?`, `createdAt: DateTime`, `updatedAt: DateTime`, `displayName: String?`, `hlsManifestPath: String?`, `transcodingStatus: TranscodingStatus`, `transcodedAt: DateTime?`, `transcodingError: String?`, `thumbnailPath: String?`, `trainer: User`, `userVideoProgresses: UserVideoProgress[]`

### model `UserVideoProgress`

`id: String`, `userId: String`, `videoId: String`, `lastPositionSec: Int`, `updatedAt: DateTime`, `user: User`, `video: TrainerVideo`

### model `UserProfile`

`id: String`, `userId: String`, `fullName: String?`, `city: String?`, `cityKey: String?`, `birthDate: DateTime?`, `about: String?`, `telegram: String?`, `instagram: String?`, `website: String?`, `avatarUrl: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`

### model `Diploma`

`id: String`, `userId: String`, `title: String`, `issuedBy: String?`, `issuedAt: DateTime?`, `url: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`

### model `Training`

`id: String`, `userId: String`, `name: String`, `isPrivate: Boolean`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`, `access: TrainingAccess[]`

### model `UserCourse`

`userId: String`, `courseId: String`, `status: TrainingStatus`, `startedAt: DateTime?`, `completedAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `userDisplayName: String?`, `userGender: String?`, `petName: String?`, `petNameDat: String?`, `petNameIns: String?`, `petGender: String?`, `petNameGen: String?`, `petNameAcc: String?`, `petNamePre: String?`, `course: Course`, `user: User`

### model `Pet`

`offlinePreventionClientBindings: OfflinePreventionClientBinding[]`, `id: String`, `ownerId: String`, `name: String`, `type: PetType`, `breed: String`, `breedKey: String?`, `birthDate: DateTime`, `heightCm: Float?`, `weightKg: Float?`, `targetWeightKg: Float?`, `neckGirthCm: Float?`, `muzzleGirthCm: Float?`, `bellyGirthCm: Float?`, `photoUrl: String?`, `showInProfile: Boolean`, `notes: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `awards: Award[]`, `documents: PetDocument[]`, `owner: User`, `preventionEntries: PetPreventionEntry[]`, `weightEntries: PetWeightEntry[]`, `vetVisits: PetVetVisit[]`, `surveyResponses: SurveyResponse[]`

### model `PetVetVisit`

`id: String`, `petId: String`, `ownerId: String`, `visitedOn: DateTime`, `specialty: String`, `doctorName: String`, `clinic: String`, `diagnosis: String`, `conclusion: String`, `notes: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `pet: Pet`, `attachments: PetVetAttachment[]`

### model `PetVetAttachment`

`id: String`, `visitId: String`, `name: String`, `mimeType: String`, `sizeBytes: Int`, `originalKey: String`, `previewKey: String?`, `createdAt: DateTime`, `visit: PetVetVisit`

### model `PetWeightEntry`

`id: String`, `petId: String`, `ownerId: String`, `weightKg: Float`, `measuredAt: DateTime`, `createdAt: DateTime`, `pet: Pet`

### model `PetDocument`

`id: String`, `petId: String`, `ownerId: String`, `name: String`, `mimeType: String`, `sizeBytes: Int`, `url: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `pet: Pet`, `owner: User`

### model `Award`

`id: String`, `petId: String`, `title: String`, `event: String?`, `date: DateTime?`, `rank: String?`, `examType: String?`, `examScore: Int?`, `courseId: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `course: Course?`, `pet: Pet`

### model `PetPreventionEntry`

`id: String`, `petId: String`, `ownerId: String`, `type: PetPreventionType`, `performedAt: DateTime`, `productName: String?`, `notes: String?`, `clientId: String?`, `reminderEnabled: Boolean`, `reminderKind: PetPreventionReminderKind`, `reminderDaysAfter: Int?`, `reminderOnDate: DateTime?`, `remindAt: DateTime?`, `reminderTimes: Json`, `lastNotifiedForRemindAt: DateTime?`, `sentTimesForRemindAt: Json?`, `createdAt: DateTime`, `updatedAt: DateTime`, `pet: Pet`, `owner: User`

### model `TrainingAccess`

`trainingId: String`, `userId: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `training: Training`, `user: User`

### model `CourseAccess`

`courseId: String`, `userId: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `course: Course`, `user: User`

### model `AppSubscriptionSettings`

`key: String`, `weeklyEnabled: Boolean`, `monthlyEnabled: Boolean`, `twoWeeksEnabled: Boolean`, `threeMonthsEnabled: Boolean`, `yookassaWeeklyPriceRub: Decimal`, `yookassaMonthlyPriceRub: Decimal`, `yookassaTwoWeeksPriceRub: Decimal`, `yookassaThreeMonthsPriceRub: Decimal`, `currency: String`, `weeklyIntervalDays: Int`, `monthlyIntervalDays: Int`, `twoWeeksIntervalDays: Int`, `threeMonthsIntervalDays: Int`, `weeklyAppleProductId: String?`, `monthlyAppleProductId: String?`, `updatedById: String?`, `updatedBy: User?`, `createdAt: DateTime`, `updatedAt: DateTime`

### enum `GafusTransactionKind`

`EARN`, `SPEND`, `ADMIN_CREDIT`, `ADMIN_DEBIT`, `LEGACY_IMPORT`

### enum `GafusRewardClass`

`ACTIVITY`, `BONUS`

### enum `GafusRewardKind`

`POST_PUBLISHED`, `QUESTION_CREATED`, `ANSWER_CREATED`, `POST_REACTION_MILESTONE`, `BEST_ANSWER`

### enum `GafusRewardDecision`

`GRANTED`, `DENIED_ACTIVITY_LIMIT`, `DENIED_ANTI_ABUSE`, `DENIED_POLICY`, `DISABLED`

### enum `GafusAccessTargetType`

`COURSE_STEP`, `MINI_GUIDE`, `ARTICLE`

### enum `GafusNotificationKind`

`REACTION_MILESTONE`, `BEST_ANSWER`

### enum `GafusOutboxStatus`

`PENDING`, `PROCESSING`, `DONE`, `FAILED`

### enum `GafusFraudSeverity`

`LOW`, `MEDIUM`, `HIGH`

### enum `GafusFraudStatus`

`OPEN`, `RESOLVED`, `DISMISSED`

### model `GafusWallet`

`userId: String`, `balance: Int`, `user: User`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `GafusTransaction`

`id: String`, `userId: String`, `user: User`, `kind: GafusTransactionKind`, `delta: Int`, `balanceBefore: Int`, `balanceAfter: Int`, `rewardKind: GafusRewardKind?`, `sourceEntityType: String?`, `sourceEntityId: String?`, `targetType: GafusAccessTargetType?`, `targetKey: String?`, `idempotencyKey: String`, `settingsRevision: Int?`, `adminActorId: String?`, `adminActor: User?`, `reason: String?`, `metadata: Json?`, `createdAt: DateTime`, `rewardEvent: GafusRewardEvent?`, `targetAccess: GafusTargetAccess?`

### model `GafusRewardEvent`

`id: String`, `userId: String`, `user: User`, `rewardClass: GafusRewardClass`, `rewardKind: GafusRewardKind`, `eventKey: String`, `sourceEntityId: String?`, `decision: GafusRewardDecision`, `amount: Int`, `occurredAt: DateTime`, `processedAt: DateTime`, `denialCode: String?`, `settingsRevision: Int`, `contentFingerprint: String?`, `transactionId: String?`, `transaction: GafusTransaction?`, `metadata: Json?`

### model `GafusPostReactionProgram`

`postId: String`, `thresholdStep: Int`, `highWaterReactionCount: Int`, `settingsRevision: Int`, `enabledAt: DateTime`, `updatedAt: DateTime`, `milestones: GafusPostReactionMilestone[]`

### model `GafusPostReactionMilestone`

`id: String`, `postId: String`, `program: GafusPostReactionProgram`, `threshold: Int`, `eligibleReactionCount: Int`, `rewardEventId: String`, `settingsRevision: Int`, `createdAt: DateTime`

### model `GafusTargetAccess`

`id: String`, `userId: String`, `user: User`, `targetType: GafusAccessTargetType`, `targetKey: String`, `courseId: String?`, `dayOnCourseId: String?`, `stepOnDayId: String?`, `transactionId: String`, `transaction: GafusTransaction`, `settingsRevision: Int`, `grantedAt: DateTime`, `expiresAt: DateTime`, `createdAt: DateTime`

### model `GafusSettings`

`key: String`, `revision: Int`, `economyEnabled: Boolean`, `earningEnabled: Boolean`, `spendingEnabled: Boolean`, `postReward: Int`, `questionReward: Int`, `answerReward: Int`, `activityLimit: Int`, `activityWindowSeconds: Int`, `reactionThreshold: Int`, `reactionReward: Int`, `bestAnswerReward: Int`, `courseStepCost: Int`, `miniGuideCost: Int`, `accessDurationSeconds: Int`, `updatedById: String?`, `updatedBy: User?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `GafusSettingsRevision`

`revision: Int`, `snapshot: Json`, `actorId: String?`, `actor: User?`, `createdAt: DateTime`

### model `GafusAdminAudit`

`id: String`, `actorId: String`, `actor: User`, `action: String`, `targetUserId: String?`, `transactionId: String?`, `reason: String`, `before: Json?`, `after: Json?`, `metadata: Json?`, `createdAt: DateTime`

### model `GafusNotificationOutbox`

`id: String`, `rewardEventId: String`, `userId: String`, `kind: GafusNotificationKind`, `title: String`, `body: String`, `url: String?`, `status: GafusOutboxStatus`, `availableAt: DateTime`, `attempts: Int`, `attemptToken: String?`, `leaseUntil: DateTime?`, `errorCode: String?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `GafusFraudSignal`

`id: String`, `userId: String`, `severity: GafusFraudSeverity`, `status: GafusFraudStatus`, `kind: String`, `entityType: String?`, `entityId: String?`, `metadata: Json?`, `resolvedAt: DateTime?`, `resolvedById: String?`, `createdAt: DateTime`

### model `RewardedAdSettings`

`key: String`, `androidEnabled: Boolean`, `iosEnabled: Boolean`, `dailyAdLimit: Int`, `yandexAndroidPlacementId: String?`, `yandexIosPlacementId: String?`, `testMode: Boolean`, `updatedById: String?`, `updatedBy: User?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `RewardedCreditWallet`

`userId: String`, `user: User`, `balance: Int`, `pendingRefundCredits: Int`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `RewardedAdSession`

`id: String`, `userId: String`, `user: User`, `platform: RewardedPlatform`, `provider: RewardedProvider`, `placementId: String`, `status: RewardedAdSessionStatus`, `targetType: RewardedTargetType?`, `targetId: String?`, `requestNonceHash: String`, `providerPayload: Json?`, `errorCode: String?`, `errorMessage: String?`, `expiresAt: DateTime`, `rewardedAt: DateTime?`, `grantedAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `events: RewardedAdEvent[]`, `targetAccess: RewardedTargetAccess?`, `transactions: RewardedCreditTransaction[]`

### model `RewardedTargetAccess`

`id: String`, `userId: String`, `user: User`, `targetType: RewardedTargetAccessType`, `targetId: String`, `source: RewardedTargetAccessSource`, `platform: RewardedPlatform?`, `sessionId: String?`, `session: RewardedAdSession?`, `grantedAt: DateTime`, `expiresAt: DateTime`, `createdAt: DateTime`

### model `RewardedCreditTransaction`

`id: String`, `userId: String`, `user: User`, `type: RewardedCreditTransactionType`, `amount: Int`, `balanceBefore: Int`, `balanceAfter: Int`, `targetType: RewardedTargetType?`, `targetId: String?`, `provider: RewardedProvider?`, `sessionId: String?`, `session: RewardedAdSession?`, `idempotencyKey: String`, `refundedTransactionId: String?`, `refundReason: String?`, `metadata: Json?`, `createdAt: DateTime`

### model `RewardedAdEvent`

`id: String`, `sessionId: String`, `session: RewardedAdSession`, `eventType: String`, `payload: Json?`, `createdAt: DateTime`

### model `AppSubscription`

`id: String`, `userId: String`, `user: User`, `provider: AppSubscriptionProvider`, `status: AppSubscriptionStatus`, `planCode: AppSubscriptionPlanCode`, `renewalPriceRub: Decimal?`, `renewalIntervalDays: Int?`, `renewalCurrency: String?`, `planTitle: String?`, `currentPeriodStart: DateTime?`, `currentPeriodEnd: DateTime?`, `pendingExpiresAt: DateTime?`, `isLifetime: Boolean`, `cancelAtPeriodEnd: Boolean`, `canceledAt: DateTime?`, `yookassaPaymentMethodId: String?`, `yookassaPaymentMethodLast4: String?`, `yookassaPaymentMethodTitle: String?`, `renewalReminderSentForPeriodEnd: DateTime?`, `renewalEmailThreeDaysSentForPeriodEnd: DateTime?`, `appleOriginalTransactionId: String?`, `appleProductId: String?`, `manualGrantedById: String?`, `manualGrantedBy: User?`, `manualReason: String?`, `payments: AppSubscriptionPayment[]`, `events: AppSubscriptionEvent[]`, `trials: AppSubscriptionTrial[]`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `AppSubscriptionTrial`

`id: String`, `userId: String`, `user: User`, `provider: AppSubscriptionProvider`, `subscriptionId: String?`, `subscription: AppSubscription?`, `startedAt: DateTime`, `endedAt: DateTime`, `paymentMethodFingerprintHash: String?`, `trialUnavailableReason: String?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `AppSubscriptionPayment`

`id: String`, `subscriptionId: String?`, `subscription: AppSubscription?`, `userId: String`, `user: User`, `provider: AppSubscriptionProvider`, `kind: AppSubscriptionPaymentKind`, `status: AppSubscriptionPaymentStatus`, `planCode: AppSubscriptionPlanCode`, `planTitle: String?`, `amount: Decimal?`, `currency: String?`, `buyerEmail: String?`, `promoCodeId: String?`, `promoCode: AppSubscriptionPromoCode?`, `promoCodeSnapshot: String?`, `promoDiscountPercent: Int?`, `originalAmount: Decimal?`, `npdReceipt: NpdReceipt?`, `partnerCommissions: PartnerCommission[]`, `financeRefunds: AppSubscriptionFinanceRefund[]`, `providerPaymentMethodType: String?`, `providerIncomeAmount: Decimal?`, `providerCapturedAt: DateTime?`, `financeSyncedAt: DateTime?`, `financeRefundsIncomplete: Boolean`, `periodStart: DateTime?`, `periodEnd: DateTime?`, `idempotenceKey: String`, `yookassaPaymentId: String?`, `appleTransactionId: String?`, `appleOriginalTransactionId: String?`, `applePriceMilliunits: Int?`, `appleStorefront: String?`, `appleEnvironment: String?`, `appleWebOrderLineItemId: String?`, `confirmationUrl: String?`, `failureCode: String?`, `failureReason: String?`, `succeededAt: DateTime?`, `attemptCount: Int`, `lastAttemptAt: DateTime?`, `nextAttemptAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `PartnerProfile`

`id: String`, `userId: String`, `user: User`, `referralCode: String?`, `promoCodeId: String?`, `promoCode: AppSubscriptionPromoCode?`, `isActive: Boolean`, `createdAt: DateTime`, `updatedAt: DateTime`, `referrals: PartnerReferral[]`, `commissions: PartnerCommission[]`, `payouts: PartnerPayout[]`, `videoExpenses: ProfitVideoExpense[]`

### model `PartnerReferral`

`id: String`, `partnerId: String`, `partner: PartnerProfile`, `buyerId: String`, `buyer: User`, `createdAt: DateTime`

### model `PartnerCommission`

`id: String`, `partnerId: String`, `partner: PartnerProfile`, `paymentId: String`, `payment: AppSubscriptionPayment`, `amountKopecks: Int`, `kind: PartnerCommissionKind`, `createdAt: DateTime`

### model `PartnerPayout`

`id: String`, `partnerId: String`, `partner: PartnerProfile`, `amountKopecks: Int`, `status: PartnerPayoutStatus`, `requestedAt: DateTime`, `processedAt: DateTime?`, `note: String?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `VkIdOneTimeLogin`

`id: String`, `tokenHash: String`, `userId: String`, `user: User`, `expiresAt: DateTime`, `requiresConsent: Boolean`, `consentCompletedAt: DateTime?`, `consumedAt: DateTime?`, `createdAt: DateTime`

### model `RegistrationEmailAttempt`

`id: String`, `tempSessionId: String`, `dataFingerprint: String`, `userId: String?`, `user: User?`, `result: RegistrationEmailAttemptResult?`, `completedAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `VkRegistrationContext`

`id: String`, `contextTokenHash: String`, `stateHash: String`, `codeVerifier: String`, `purpose: VkRegistrationContextPurpose`, `expiresAt: DateTime`, `selectedPromoCodeId: String?`, `selectedPromoCodeValue: String?`, `selectedPromoCode: AppSubscriptionPromoCode?`, `userId: String?`, `user: User?`, `resultUserId: String?`, `resultUser: User?`, `loginGrants: VkLoginGrant[]`, `completionFingerprint: String?`, `completedAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `VkLoginGrant`

`id: String`, `tokenHash: String`, `userId: String`, `user: User`, `purpose: VkLoginGrantPurpose`, `expiresAt: DateTime`, `consentCompletedAt: DateTime?`, `consumedAt: DateTime?`, `reissuedFromId: String?`, `registrationContextId: String?`, `registrationContext: VkRegistrationContext?`, `createdAt: DateTime`

### model `NpdConnection`

`id: String`, `inn: String`, `deviceId: String`, `refreshTokenCipher: Bytes`, `refreshTokenIv: Bytes`, `refreshTokenTag: Bytes`, `refreshTokenKeyVersion: Int`, `status: NpdConnectionStatus`, `fiscalizationStartedAt: DateTime?`, `lastAuthorizedAt: DateTime?`, `lastSuccessfulOperationAt: DateTime?`, `lastRefreshedAt: DateTime?`, `lastErrorCode: String?`, `lastErrorRedacted: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `receipts: NpdReceipt[]`

### model `NpdReceipt`

`id: String`, `paymentId: String`, `payment: AppSubscriptionPayment`, `connectionId: String`, `connection: NpdConnection`, `status: NpdReceiptStatus`, `amountKopecks: Int`, `currency: String`, `planCode: AppSubscriptionPlanCode`, `intervalDays: Int`, `serviceName: String`, `buyerEmail: String?`, `providerReceiptId: String?`, `operationAt: DateTime`, `printUrl: String?`, `jsonUrl: String?`, `issuedAt: DateTime?`, `canceledAt: DateTime?`, `cancellationReason: String?`, `operations: NpdReceiptOperation[]`, `emailDelivery: NpdReceiptEmailDelivery?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `NpdReceiptOperation`

`id: String`, `receiptId: String`, `receipt: NpdReceipt`, `type: NpdReceiptOperationType`, `status: NpdReceiptOperationStatus`, `attemptCount: Int`, `lastAttemptAt: DateTime?`, `nextAttemptAt: DateTime?`, `leaseOwner: String?`, `leaseExpiresAt: DateTime?`, `providerRequestId: String?`, `completedAt: DateTime?`, `lastErrorCode: String?`, `lastErrorRedacted: String?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `NpdReceiptEmailDelivery`

`id: String`, `receiptId: String`, `receipt: NpdReceipt`, `status: NpdReceiptEmailDeliveryStatus`, `recipientEmail: String`, `attemptCount: Int`, `lastAttemptAt: DateTime?`, `nextAttemptAt: DateTime?`, `leaseOwner: String?`, `leaseExpiresAt: DateTime?`, `sentAt: DateTime?`, `providerMessageId: String?`, `lastErrorCode: String?`, `lastErrorRedacted: String?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `AppSubscriptionPromoCode`

`id: String`, `code: String`, `normalizedCode: String`, `discountPercent: Int`, `isActive: Boolean`, `revision: Int`, `archivedAt: DateTime?`, `createdById: String?`, `createdBy: User?`, `updatedById: String?`, `updatedBy: User?`, `events: AppSubscriptionPromoCodeEvent[]`, `payments: AppSubscriptionPayment[]`, `partnerProfile: PartnerProfile?`, `savedForRegistrationBy: User[]`, `vkRegistrationContexts: VkRegistrationContext[]`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `AppSubscriptionPromoCodeEvent`

`id: String`, `promoCodeId: String`, `promoCode: AppSubscriptionPromoCode`, `type: AppSubscriptionPromoCodeEventType`, `actorId: String?`, `actor: User?`, `discountPercent: Int`, `isActive: Boolean`, `revision: Int`, `createdAt: DateTime`

### model `AppSubscriptionEvent`

`id: String`, `subscriptionId: String?`, `subscription: AppSubscription?`, `userId: String?`, `user: User?`, `source: AppSubscriptionEventSource`, `eventType: String`, `providerEventKey: String?`, `idempotencyKey: String?`, `payloadHash: String?`, `processingStatus: AppSubscriptionEventProcessingStatus`, `processingAttempts: Int`, `lastProcessingError: String?`, `actorId: String?`, `actor: User?`, `metadata: Json?`, `processedAt: DateTime?`, `createdAt: DateTime`

### model `FavoriteCourse`

`userId: String`, `courseId: String`, `createdAt: DateTime`, `course: Course`, `user: User`

### model `CourseReview`

`id: String`, `userId: String`, `courseId: String`, `rating: Float?`, `comment: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `course: Course`, `user: User`

### model `PasswordResetToken`

`id: String`, `token: String`, `userId: String`, `expiresAt: DateTime`, `createdAt: DateTime`, `updatedAt: DateTime`, `shortCode: String?`, `user: User`

### model `AccountDeletionToken`

`id: String`, `userId: String`, `shortCode: String`, `expiresAt: DateTime`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`

### model `AccountDeletionAudit`

`id: String`, `userId: String`, `role: UserRole`, `hadEmail: Boolean`, `initiatedBy: String`, `deletedAt: DateTime`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `AccountDeletionCounter`

`id: String`, `totalDeleted: Int`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `EmailChangeToken`

`id: String`, `userId: String`, `newEmail: String`, `token: String`, `expiresAt: DateTime`, `createdAt: DateTime`, `user: User`

### model `RefreshToken`

`id: String`, `userId: String`, `tokenHash: String`, `deviceId: String?`, `userAgent: String?`, `ipAddress: String?`, `createdAt: DateTime`, `expiresAt: DateTime`, `revokedAt: DateTime?`, `user: User`

### model `Account`

`id: String`, `userId: String`, `type: String`, `provider: String`, `providerAccountId: String`, `refresh_token: String?`, `access_token: String?`, `expires_at: Int?`, `token_type: String?`, `scope: String?`, `id_token: String?`, `session_state: String?`, `user: User`

### model `Session`

`id: String`, `sessionToken: String`, `userId: String`, `expires: DateTime`, `user: User`

### model `PushSubscription`

`id: String`, `userId: String`, `endpoint: String`, `keys: Json`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`

### model `StepNotification`

`id: String`, `userId: String`, `day: Int`, `stepIndex: Int`, `dayOnCourseId: String?`, `stepOnDayId: String?`, `originalStepId: String?`, `endTs: Int`, `sent: Boolean`, `subscription: Json`, `url: String?`, `jobId: String?`, `paused: Boolean`, `remainingSec: Int?`, `stepTitle: String?`, `type: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`

### model `ExamResult`

`id: String`, `userStepId: String?`, `dailyCourseUserStepId: String?`, `stepId: String`, `testAnswers: Json?`, `testScore: Int?`, `testMaxScore: Int?`, `videoReportUrl: String?`, `videoDeletedAt: DateTime?`, `videoDeleteReason: String?`, `writtenFeedback: String?`, `overallScore: Int?`, `isPassed: Boolean?`, `createdAt: DateTime`, `updatedAt: DateTime`, `trainerComment: String?`, `reviewedAt: DateTime?`, `reviewedById: String?`, `reviewedBy: User?`, `step: Step`, `userStep: UserStep?`, `dailyCourseUserStep: DailyCourseUserStep?`

### enum `SurveyPhase`

`INITIAL`, `FINAL`

### model `SurveyResponse`

`id: String`, `userId: String`, `courseId: String`, `stepId: String`, `petId: String?`, `surveySlug: String`, `surveyFamilySlug: String`, `phase: SurveyPhase`, `surveyVersion: Int`, `answers: Json`, `submittedAt: DateTime`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`, `course: Course`, `step: Step`, `pet: Pet?`

### model `ReengagementCampaign`

`id: String`, `userId: String`, `isActive: Boolean`, `currentLevel: Int`, `lastActivityDate: DateTime`, `campaignStartDate: DateTime`, `lastNotificationSent: DateTime?`, `nextNotificationDate: DateTime?`, `returned: Boolean`, `returnedAt: DateTime?`, `unsubscribed: Boolean`, `totalNotificationsSent: Int`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`, `notifications: ReengagementNotification[]`

### model `ReengagementNotification`

`id: String`, `campaignId: String`, `level: Int`, `messageType: String`, `variantId: String`, `title: String`, `body: String`, `url: String?`, `sent: Boolean`, `sentAt: DateTime?`, `opened: Boolean`, `openedAt: DateTime?`, `clicked: Boolean`, `clickedAt: DateTime?`, `successCount: Int`, `failedCount: Int`, `createdAt: DateTime`, `campaign: ReengagementCampaign`

### model `ReengagementSettings`

`id: String`, `userId: String`, `enabled: Boolean`, `unsubscribedAt: DateTime?`, `preferredTime: String?`, `timezone: String`, `maxNotificationsPerWeek: Int`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`

### model `ReminderMutationReceipt`

`ownerUserId: String`, `operationKey: String`, `operationKind: String`, `fingerprint: String`, `state: String`, `reminderId: String?`, `responseJson: Json?`, `expiresAt: DateTime`, `createdAt: DateTime`, `owner: User`

### model `Reminder`

`id: String`, `userId: String`, `type: String`, `name: String`, `enabled: Boolean`, `reminderTime: String`, `reminderDays: String?`, `timezone: String`, `metadata: Json?`, `lastSentAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`, `deliveries: TrainingReminderDelivery[]`

### model `TrainingReminderDelivery`

`id: String`, `reminderId: String`, `localDate: String`, `status: String`, `leaseToken: String?`, `leaseExpiresAt: DateTime?`, `attemptCount: Int`, `sentAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `reminder: Reminder`

### model `ReengagementMetrics`

`id: String`, `date: DateTime`, `totalActive: Int`, `totalSent: Int`, `totalReturned: Int`, `level1Sent: Int`, `level2Sent: Int`, `level3Sent: Int`, `level4Sent: Int`, `openRate: Float?`, `clickRate: Float?`, `returnRate: Float?`, `emotionalSent: Int`, `educationalSent: Int`, `motivationalSent: Int`, `mixedSent: Int`

### model `PresentationView`

`id: String`, `sessionId: String`, `visitorId: String?`, `referrer: String?`, `referrerDomain: String?`, `utmSource: String?`, `utmMedium: String?`, `utmCampaign: String?`, `refParam: String?`, `campaignParam: String?`, `sourceParam: String?`, `tagParam: String?`, `userAgent: String?`, `ipAddress: String?`, `language: String?`, `deviceType: String?`, `screenWidth: Int?`, `screenHeight: Int?`, `timeOnPage: Int?`, `scrollDepth: Int?`, `reachedHero: Int?`, `reachedProblem: Int?`, `reachedSolution: Int?`, `reachedFeatures: Int?`, `reachedComparison: Int?`, `reachedGoals: Int?`, `reachedContact: Int?`, `ctaClicks: Int`, `convertedToUser: Boolean`, `convertedUserId: String?`, `firstViewAt: DateTime`, `lastViewAt: DateTime`, `sessionEndedAt: DateTime?`, `additionalData: Json?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `PresentationEvent`

`id: String`, `sessionId: String`, `viewId: String?`, `eventType: String`, `eventName: String`, `targetElement: String?`, `targetSection: String?`, `scrollDepth: Int?`, `timeOnPage: Int?`, `metadata: Json?`, `createdAt: DateTime`

### model `ErrorLog`

`id: String`, `message: String`, `stack: String?`, `level: String`, `appName: String`, `environment: String`, `context: String?`, `url: String?`, `userAgent: String?`, `userId: String?`, `sessionId: String?`, `componentStack: String?`, `additionalContext: Json?`, `tags: String[]`, `status: String`, `timestamp: DateTime`, `createdAt: DateTime`, `updatedAt: DateTime`, `resolvedAt: DateTime?`, `resolvedBy: String?`

### model `TrainerAIChat`

`id: String`, `trainerId: String`, `role: String`, `content: String`, `tokensUsed: Int?`, `createdAt: DateTime`, `model: String?`, `attachments: Json?`, `trainer: User`

### model `TrainerAIConfig`

`id: String`, `trainerId: String`, `apiKey: String?`, `model: String`, `enabled: Boolean`, `createdAt: DateTime`, `updatedAt: DateTime`, `provider: String`, `trainer: User`

### model `TrainerNote`

`id: String`, `trainerId: String`, `createdAt: DateTime`, `title: String?`, `tags: String[]`, `trainer: User`, `entries: TrainerNoteEntry[]`, `students: TrainerNoteStudent[]`

### model `TrainerNoteEntry`

`id: String`, `noteId: String`, `content: String`, `order: Int`, `createdAt: DateTime`, `updatedAt: DateTime`, `isVisibleToStudent: Boolean`, `note: TrainerNote`

### model `TrainerNoteStudent`

`id: String`, `noteId: String`, `studentId: String`, `createdAt: DateTime`, `note: TrainerNote`, `student: User`

### enum `TrainingStatus`

`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `RESET`

### enum `RegistrationChannel`

`WEB`, `IOS`, `ANDROID`, `UNKNOWN`

### enum `UserRole`

`USER`, `PARTNER`, `TRAINER`, `ADMIN`, `MODERATOR`

### enum `PartnerCommissionKind`

`EARNED`, `REFUND_ADJUSTMENT`

### enum `PartnerPayoutStatus`

`PENDING`, `PAID`, `REJECTED`

### enum `RegistrationEmailAttemptResult`

`SUCCEEDED`, `USERNAME_TAKEN`, `EMAIL_TAKEN`, `VALIDATION_ERROR`

### enum `VkRegistrationContextPurpose`

`REGISTER`, `LOGIN`, `LINK_ACCOUNT`

### enum `VkLoginGrantPurpose`

`LOGIN`, `REGISTRATION_CONSENT`

### enum `PetType`

`DOG`, `CAT`

### enum `PetPreventionType`

`VACCINATION`, `DEWORMING`, `TICKS_FLEAS`

### enum `PetPreventionReminderKind`

`AFTER_DAYS`, `ON_DATE`

### enum `TrainingLevel`

`BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT`

### enum `StepType`

`TRAINING`, `EXAMINATION`, `THEORY`, `BREAK`, `PRACTICE`, `DIARY`, `SURVEY`

### enum `TranscodingStatus`

`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`

### enum `AppSubscriptionProvider`

`YOOKASSA`, `APPLE`, `MANUAL`

### enum `AppSubscriptionPlanCode`

`WEEKLY`, `TWO_WEEKS`, `MONTHLY`, `THREE_MONTHS`

### enum `AppSubscriptionStatus`

`PENDING`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `EXPIRED`, `REFUNDED`, `REVOKED`

### enum `AppSubscriptionPaymentKind`

`INITIAL`, `RENEWAL`

### enum `AppSubscriptionPaymentStatus`

`PENDING`, `SUCCEEDED`, `CANCELED`, `FAILED`, `REFUNDED`

### enum `NpdConnectionStatus`

`ACTIVE`, `REAUTH_REQUIRED`, `DISABLED`

### enum `NpdReceiptStatus`

`PENDING`, `ISSUED`, `CANCEL_PENDING`, `CANCELED`, `RECONCILIATION_REQUIRED`, `FAILED`

### enum `NpdReceiptOperationType`

`CREATE`, `CANCEL`

### enum `NpdReceiptOperationStatus`

`PENDING`, `PROCESSING`, `RETRY`, `SUCCEEDED`, `NOT_REQUIRED`, `RECONCILIATION_REQUIRED`, `FAILED`

### enum `NpdReceiptEmailDeliveryStatus`

`PENDING`, `PROCESSING`, `SENT`, `FAILED`, `DEAD_LETTER`, `SKIPPED`

### enum `AppSubscriptionPromoCodeEventType`

`CREATED`, `UPDATED`, `ENABLED`, `DISABLED`, `ARCHIVED`

### enum `AppSubscriptionEventSource`

`YOOKASSA`, `APPLE`, `ADMIN`, `SYSTEM`

### enum `AppSubscriptionEventProcessingStatus`

`RECEIVED`, `PROCESSING`, `PROCESSED`, `FAILED`

### enum `RewardedPlatform`

`ANDROID`, `IOS`

### enum `RewardedProvider`

`YANDEX`

### enum `RewardedAdSessionStatus`

`CREATED`, `LOADED`, `SHOWN`, `REWARDED`, `GRANTED`, `DISMISSED`, `FAILED`, `EXPIRED`

### enum `RewardedCreditTransactionType`

`EARN`, `SPEND`, `REFUND`, `ADJUSTMENT`

### enum `RewardedTargetType`

`ARTICLE`, `COURSE_STEP`, `DAILY_COURSE_STEP`, `CONSULTATION_BOOKING`

### enum `RewardedTargetAccessType`

`ARTICLE`, `COURSE_STEP`

### enum `RewardedTargetAccessSource`

`REWARDED_AD`, `LEGACY_GAFUS`

### enum `ArticleContentType`

`TEXT`, `HTML`

### enum `ArticleVisibility`

`PUBLIC`, `PAID`

### model `Article`

`id: String`, `authorId: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `title: String`, `contentType: ArticleContentType`, `content: String`, `visibility: ArticleVisibility`, `videoUrl: String?`, `logoImg: String`, `imageUrls: String[]`, `slug: String`, `viewCount: Int`, `description: String`, `author: User`, `articleLikes: ArticleLike[]`, `viewers: ArticleViewer[]`, `guestViews: ArticleGuestView[]`

### model `ArticleLike`

`userId: String`, `articleId: String`, `createdAt: DateTime`, `user: User`, `article: Article`

### model `ArticleViewer`

`articleId: String`, `userId: String`, `firstViewedAt: DateTime`, `lastViewedAt: DateTime`, `article: Article`, `user: User`

### model `ArticleGuestView`

`articleId: String`, `visitorKey: String`, `firstViewedAt: DateTime`, `article: Article`

### model `AppFeatureFlag`

`key: String`, `enabled: Boolean`, `reviewEnabled: Boolean?`, `updatedAt: DateTime`

### model `MobileAppReleasePolicy`

`key: String`, `iosReviewVersion: String?`, `revision: Int`, `updatedById: String?`, `updatedBy: User?`, `createdAt: DateTime`, `updatedAt: DateTime`

### enum `ConsultationSlotStatus`

`FREE`, `BOOKED`, `BLOCKED`

### enum `ConsultationBookingStatus`

`PENDING_TRAINER_CONFIRMATION`, `CONFIRMED`, `CANCELLED_BY_TRAINER`, `CANCELLED_BY_USER`, `CANCELLED_BY_SLA`, `CANCELLED_BY_SYSTEM`, `COMPLETED`, `NO_SHOW`

### enum `ConsultationPetGender`

`MALE`, `FEMALE`

### enum `ConsultationEmailType`

`TRAINER_CONFIRM_REQUEST`, `CLIENT_BOOKING_RECEIVED`, `CLIENT_BOOKING_CONFIRMED`, `TRAINER_BOOKING_CONFIRMED`, `CLIENT_BOOKING_CANCELLED_BY_TRAINER`, `TRAINER_BOOKING_CANCELLED_BY_USER`, `CLIENT_BOOKING_CANCELLED_BY_SLA`, `CLIENT_BOOKING_VIDEO_FAILED`, `CLIENT_CONSULTATION_REMINDER_30M`, `CLIENT_CONSULTATION_START`, `TRAINER_CONSULTATION_REMINDER_30M`, `CLIENT_CONSULTATION_NO_SHOW`

### enum `ConsultationEmailStatus`

`PENDING`, `SENT`, `FAILED`

### model `ConsultationCynologist`

`id: String`, `userId: String`, `isListed: Boolean`, `slotDurationMin: Int`, `timezone: String`, `bookingLeadTimeMin: Int`, `slotHorizonDays: Int`, `confirmationSlaMin: Int`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`, `availabilityRules: ConsultationAvailabilityRule[]`, `dayOffs: ConsultationDayOff[]`, `slotExceptions: ConsultationSlotException[]`, `slots: ConsultationSlot[]`, `bookings: ConsultationBooking[]`

### model `ConsultationAvailabilityRule`

`id: String`, `cynologistId: String`, `weekday: Int`, `startTime: String`, `endTime: String`, `isWorkingDay: Boolean`, `createdAt: DateTime`, `updatedAt: DateTime`, `cynologist: ConsultationCynologist`

### model `ConsultationDayOff`

`id: String`, `cynologistId: String`, `date: DateTime`, `reason: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `cynologist: ConsultationCynologist`

### model `ConsultationSlotException`

`id: String`, `cynologistId: String`, `startAt: DateTime`, `endAt: DateTime`, `reason: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `cynologist: ConsultationCynologist`

### model `ConsultationSlot`

`id: String`, `cynologistId: String`, `startAt: DateTime`, `endAt: DateTime`, `status: ConsultationSlotStatus`, `createdAt: DateTime`, `updatedAt: DateTime`, `cynologist: ConsultationCynologist`, `bookings: ConsultationBooking[]`

### model `ConsultationBooking`

`id: String`, `clientId: String`, `cynologistId: String`, `slotId: String`, `clientOwnerName: String?`, `clientPhone: String?`, `petName: String?`, `petGender: ConsultationPetGender?`, `petAge: String?`, `petBreed: String?`, `clientProblem: String?`, `clientSelfHelpAttempt: String?`, `status: ConsultationBookingStatus`, `completedAt: DateTime?`, `trainerConfirmedAt: DateTime?`, `cancelReason: String?`, `confirmationDeadlineAt: DateTime`, `createdAt: DateTime`, `updatedAt: DateTime`, `client: User`, `cynologist: ConsultationCynologist`, `slot: ConsultationSlot`, `emailLogs: ConsultationEmailLog[]`

### model `ConsultationEmailLog`

`id: String`, `bookingId: String`, `type: ConsultationEmailType`, `status: ConsultationEmailStatus`, `attempts: Int`, `lastError: String?`, `sentAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `booking: ConsultationBooking`

### model `ConsultationBookingIdempotency`

`clientId: String`, `key: String`, `bookingId: String?`, `responseJson: Json`, `expiresAt: DateTime`, `client: User`

### model `CynologistChat`

`id: String`, `clientUserId: String`, `trainerUserId: String`, `streamChannelId: String`, `intake: Json`, `provisionStatus: String`, `firstMessageId: String`, `lastMessageAt: DateTime?`, `lastClientMessageAt: DateTime?`, `trainerReadAt: DateTime?`, `unreadSince: DateTime?`, `nextReminderAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `client: User`, `trainer: User`, `operations: ChatSendOperation[]`, `attachments: ChatAttachment[]`, `notifications: ChatNotification[]`

### model `ChatSendOperation`

`id: String`, `chatId: String`, `senderUserId: String`, `clientMessageId: String`, `streamMessageId: String`, `payloadHash: String`, `state: String`, `createdAt: DateTime`, `chat: CynologistChat`

### model `ChatAttachment`

`id: String`, `operationId: String?`, `chatId: String`, `ownerUserId: String`, `kind: String`, `url: String`, `mime: String`, `size: Int`, `name: String`, `state: String`, `createdAt: DateTime`, `chat: CynologistChat`

### model `ChatWebhookEvent`

`id: String`, `payload: Json`, `processedAt: DateTime?`, `createdAt: DateTime`

### model `ChatNotification`

`id: String`, `chatId: String`, `userId: String`, `notificationId: String?`, `createdAt: DateTime`, `chat: CynologistChat`

### model `CommunityChatSendOperation`

`id: String`, `senderUserId: String`, `clientMessageId: String`, `streamMessageId: String`, `payloadHash: String`, `state: String`, `createdAt: DateTime`, `sender: User`

### model `CommunityChatAttachment`

`id: String`, `operationId: String?`, `ownerUserId: String`, `kind: String`, `url: String`, `mime: String`, `size: Int`, `name: String`, `state: String`, `createdAt: DateTime`, `owner: User`

### model `AppSubscriptionFinanceRefund`

`id: String`, `providerRefundId: String`, `paymentId: String`, `payment: AppSubscriptionPayment`, `amountKopecks: Int`, `refundedAt: DateTime`, `createdAt: DateTime`

### model `ProfitVideoExpense`

`id: String`, `requestKey: String`, `version: Int`, `partnerId: String`, `partner: PartnerProfile`, `paidAt: DateTime`, `quantity: Int`, `unitPriceKopecks: Int`, `amountKopecks: Int`, `comment: String?`, `actorId: String`, `actor: User`, `canceledAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `revisions: ProfitVideoExpenseRevision[]`

### model `ProfitVideoExpenseRevision`

`id: String`, `expenseId: String`, `expense: ProfitVideoExpense`, `actorId: String`, `action: String`, `snapshot: Json`, `createdAt: DateTime`

### model `Question`

`id: String`, `authorId: String`, `clientRequestId: String`, `title: String`, `body: String`, `category: String`, `tags: String[]`, `createdAt: DateTime`, `updatedAt: DateTime`, `editedAt: DateTime?`, `activityAt: DateTime`, `closedAt: DateTime?`, `deletedAt: DateTime?`, `hiddenAt: DateTime?`, `bestAnswerId: String?`, `author: User`, `answers: QuestionAnswer[]`, `bestAnswer: QuestionAnswer?`, `photos: QuestionPhoto[]`, `views: QuestionView[]`, `reports: QuestionReport[]`

### model `QuestionAnswer`

`id: String`, `questionId: String`, `authorId: String`, `clientRequestId: String`, `body: String`, `parentId: String?`, `replyToId: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `editedAt: DateTime?`, `deletedAt: DateTime?`, `hiddenAt: DateTime?`, `question: Question`, `chosenIn: Question?`, `author: User`, `parent: QuestionAnswer?`, `children: QuestionAnswer[]`, `replyTo: QuestionAnswer?`, `replies: QuestionAnswer[]`, `hearts: QuestionHeart[]`, `photos: QuestionPhoto[]`, `reports: QuestionReport[]`

### model `QuestionHeart`

`answerId: String`, `userId: String`, `createdAt: DateTime`, `answer: QuestionAnswer`, `user: User`

### model `QuestionView`

`questionId: String`, `userId: String`, `createdAt: DateTime`, `question: Question`, `user: User`

### model `QuestionPhoto`

`id: String`, `ownerId: String`, `url: String`, `storagePath: String`, `questionId: String?`, `answerId: String?`, `createdAt: DateTime`, `owner: User`, `question: Question?`, `answer: QuestionAnswer?`

### model `QuestionReport`

`id: String`, `reporterId: String`, `questionId: String`, `answerId: String?`, `targetKey: String`, `reason: String`, `details: String`, `createdAt: DateTime`, `resolvedAt: DateTime?`, `resolution: String?`, `reporter: User`, `question: Question`, `answer: QuestionAnswer?`

### model `QuestionBlock`

`userId: String`, `reason: String`, `createdAt: DateTime`, `user: User`

### enum `GalleryPhotoStatus`

`pending`, `processing`, `ready`, `moving`, `failed`

### enum `GalleryUploadStatus`

`reserved`, `uploaded`, `processing`, `ready`, `failed`, `cancelled`, `expired`

### enum `GalleryStorageJobKind`

`publish`, `move`, `delete`, `vetPreview`

### enum `GalleryStorageJobStatus`

`pending`, `processing`, `done`, `failed`, `cancelled`

### model `GalleryAlbum`

`id: String`, `ownerId: String`, `name: String`, `description: String?`, `isVisible: Boolean`, `coverPhotoId: String?`, `deletedAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `owner: User`, `photos: GalleryPhoto[]`

### model `GalleryPhoto`

`id: String`, `ownerId: String`, `albumId: String`, `caption: String?`, `status: GalleryPhotoStatus`, `thumbKey: String?`, `fullKey: String?`, `width: Int?`, `height: Int?`, `reservationExpiresAt: DateTime`, `deletedAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `owner: User`, `album: GalleryAlbum`, `upload: GalleryUpload?`

### model `GalleryUpload`

`id: String`, `ownerId: String`, `photoId: String`, `clientRequestId: String`, `requestFingerprint: String`, `retryOfId: String?`, `retryCount: Int`, `filename: String`, `declaredMime: String`, `declaredBytes: Int`, `sourceKey: String`, `sourceETag: String?`, `status: GalleryUploadStatus`, `postExpiresAt: DateTime`, `reservationExpiresAt: DateTime`, `attempts: Int`, `attemptToken: String?`, `leaseUntil: DateTime?`, `nextAttemptAt: DateTime`, `stagedThumbKey: String?`, `stagedFullKey: String?`, `errorCode: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `owner: User`, `photo: GalleryPhoto`

### model `GalleryStorageJob`

`id: String`, `dedupeKey: String`, `ownerId: String`, `photoId: String?`, `uploadId: String?`, `destinationAlbumId: String?`, `kind: GalleryStorageJobKind`, `status: GalleryStorageJobStatus`, `sourceKeys: String[]`, `sourceETags: String[]`, `targetKeys: String[]`, `width: Int?`, `height: Int?`, `availableAt: DateTime`, `attempts: Int`, `attemptToken: String?`, `leaseUntil: DateTime?`, `errorCode: String?`, `createdAt: DateTime`, `updatedAt: DateTime`

### enum `FeedPostStatus`

`draft`, `pending`, `published`, `failed`, `deleted`

### enum `FeedRevisionStatus`

`draft`, `pending`, `ready`, `failed`, `superseded`

### enum `FeedMediaKind`

`photo`, `video`

### enum `FeedMediaStatus`

`reserved`, `uploaded`, `processing`, `ready`, `failed`, `cancelled`, `expired`

### enum `FeedJobKind`

`copy_album`, `publish_photo`, `publish_video`, `delete_keys`, `cleanup_source`

### enum `FeedJobStatus`

`pending`, `processing`, `completed`, `failed`

### enum `FeedReactionKind`

`heart`, `laugh`, `dog`, `fire`, `like`

### enum `FeedNotificationKind`

`author_post`, `comment`, `reply`, `post_reaction`, `comment_reaction`

### model `FeedPost`

`moderationState: String`, `moderationReason: String?`, `moderatedAt: DateTime?`, `bookmarks: FeedBookmark[]`, `feedback: FeedUserPostFeedback[]`, `impressions: FeedImpression[]`, `rankingEvents: FeedRankingEvent[]`, `rankingStats: FeedPostStats?`, `id: String`, `authorId: String`, `status: FeedPostStatus`, `clientRequestId: String`, `version: Int`, `activeRevisionId: String?`, `publishedAt: DateTime?`, `editedAt: DateTime?`, `deletedAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `author: User`, `revisions: FeedPostRevision[]`, `poll: FeedPoll?`, `media: FeedMediaAsset[]`, `uploads: FeedUpload[]`, `comments: FeedComment[]`, `reactions: FeedPostReaction[]`, `views: FeedPostView[]`, `notifications: FeedNotification[]`

### model `FeedPostRevision`

`id: String`, `postId: String`, `revisionNumber: Int`, `status: FeedRevisionStatus`, `text: String`, `clientRequestId: String`, `acceptedAt: DateTime?`, `errorCode: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `post: FeedPost`, `attachments: FeedRevisionAttachment[]`

### model `FeedMediaAsset`

`id: String`, `postId: String`, `ownerId: String`, `kind: FeedMediaKind`, `status: FeedMediaStatus`, `width: Int?`, `height: Int?`, `durationSeconds: Float?`, `smallKey: String?`, `thumbKey: String?`, `fullKey: String?`, `posterKey: String?`, `mp4Keys: String[]`, `errorCode: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `post: FeedPost`, `owner: User`, `upload: FeedUpload?`, `attachments: FeedRevisionAttachment[]`, `commentAttachments: FeedCommentMedia[]`, `pollOptions: FeedPollOption[]`

### model `FeedRevisionAttachment`

`revisionId: String`, `mediaId: String`, `position: Int`, `revision: FeedPostRevision`, `media: FeedMediaAsset`

### model `FeedPoll`

`id: String`, `postId: String`, `question: String`, `explanation: String?`, `allowMultiple: Boolean`, `isQuiz: Boolean`, `isAnonymous: Boolean`, `hideResults: Boolean`, `shuffleOptions: Boolean`, `endDate: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `post: FeedPost`, `options: FeedPollOption[]`, `votes: FeedPollVote[]`

### model `FeedPollOption`

`id: String`, `pollId: String`, `position: Int`, `text: String`, `imageMediaId: String?`, `isCorrect: Boolean`, `poll: FeedPoll`, `imageMedia: FeedMediaAsset?`, `selections: FeedPollVoteSelection[]`

### model `FeedPollVote`

`pollId: String`, `userId: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `poll: FeedPoll`, `user: User`, `selections: FeedPollVoteSelection[]`

### model `FeedPollVoteSelection`

`pollId: String`, `userId: String`, `optionId: String`, `vote: FeedPollVote`, `option: FeedPollOption`

### model `FeedUpload`

`id: String`, `ownerId: String`, `postId: String`, `mediaId: String`, `clientRequestId: String`, `requestFingerprint: String`, `filename: String`, `declaredMime: String`, `declaredBytes: Int`, `purpose: String`, `sourceKey: String`, `sourceETag: String?`, `status: FeedMediaStatus`, `postExpiresAt: DateTime`, `reservationExpiresAt: DateTime`, `attempts: Int`, `attemptToken: String?`, `leaseUntil: DateTime?`, `nextAttemptAt: DateTime`, `errorCode: String?`, `createdAt: DateTime`, `updatedAt: DateTime`, `owner: User`, `post: FeedPost`, `media: FeedMediaAsset`

### model `FeedStorageJob`

`id: String`, `dedupeKey: String`, `ownerId: String`, `postId: String?`, `uploadId: String?`, `mediaId: String?`, `kind: FeedJobKind`, `status: FeedJobStatus`, `sourceKeys: String[]`, `targetKeys: String[]`, `availableAt: DateTime`, `attempts: Int`, `attemptToken: String?`, `leaseUntil: DateTime?`, `errorCode: String?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `FeedComment`

`moderationState: String`, `moderationReason: String?`, `moderatedAt: DateTime?`, `id: String`, `postId: String`, `authorId: String`, `text: String`, `rootId: String?`, `replyToId: String?`, `deletedAt: DateTime?`, `editedAt: DateTime?`, `clientRequestId: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `post: FeedPost`, `author: User`, `root: FeedComment?`, `rootedReplies: FeedComment[]`, `replyTo: FeedComment?`, `addressedReplies: FeedComment[]`, `reactions: FeedCommentReaction[]`, `notifications: FeedNotification[]`, `media: FeedCommentMedia[]`

### model `FeedCommentMedia`

`commentId: String`, `mediaId: String`, `position: Int`, `comment: FeedComment`, `media: FeedMediaAsset`

### model `FeedPostReaction`

`id: String`, `postId: String`, `userId: String`, `kind: FeedReactionKind`, `createdAt: DateTime`, `updatedAt: DateTime`, `post: FeedPost`, `user: User`

### model `FeedCommentReaction`

`id: String`, `commentId: String`, `userId: String`, `kind: FeedReactionKind`, `createdAt: DateTime`, `updatedAt: DateTime`, `comment: FeedComment`, `user: User`

### model `FeedPostView`

`postId: String`, `userId: String`, `createdAt: DateTime`, `post: FeedPost`, `user: User`

### model `FeedPersonalizationPreference`

`userId: String`, `enabled: Boolean`, `useCity: Boolean`, `usePets: Boolean`, `useBehavior: Boolean`, `exploration: Boolean`, `historyResetAt: DateTime?`, `updatedAt: DateTime`, `user: User`

### model `FeedImpression`

`id: String`, `eventId: String`, `userId: String`, `postId: String`, `rankingSessionId: String`, `algorithmVersion: String`, `rank: Int`, `visibleMs: Int`, `features: Json?`, `candidateSources: String[]`, `modelVersion: String?`, `experimentVariant: String?`, `occurredAt: DateTime`, `updatedAt: DateTime`, `user: User`, `post: FeedPost`

### model `FeedRankingEvent`

`eventId: String`, `userId: String`, `postId: String`, `rankingSessionId: String`, `kind: String`, `durationMs: Int`, `createdAt: DateTime`, `user: User`, `post: FeedPost`

### model `FeedPostStats`

`postId: String`, `reactionCount: Int`, `uniqueCommenterCount: Int`, `bookmarkCount: Int`, `uniqueViewCount: Int`, `qualifiedImpressionCount: Int`, `updatedAt: DateTime`, `post: FeedPost`

### model `FeedUserAuthorAffinity`

`userId: String`, `authorId: String`, `score: Float`, `reactionCount: Int`, `commentCount: Int`, `bookmarkCount: Int`, `qualifiedViewCount: Int`, `lastInteractionAt: DateTime?`, `updatedAt: DateTime`, `viewer: User`, `author: User`

### model `FeedUserPostFeedback`

`userId: String`, `postId: String`, `kind: String`, `createdAt: DateTime`, `user: User`, `post: FeedPost`

### model `FeedSmartRankerModel`

`id: String`, `version: String`, `artifact: Json`, `active: Boolean`, `trainedAt: DateTime`, `trainRows: Int`, `validationRows: Int`, `createdAt: DateTime`

### model `FeedNotification`

`id: String`, `recipientId: String`, `postId: String`, `commentId: String?`, `kind: FeedNotificationKind`, `groupKey: String?`, `actorIds: String[]`, `reaction: FeedReactionKind?`, `readAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`, `recipient: User`, `post: FeedPost`, `comment: FeedComment?`

### model `FeedNotificationOutbox`

`id: String`, `notificationId: String`, `recipientId: String`, `availableAt: DateTime`, `status: FeedJobStatus`, `attempts: Int`, `leaseUntil: DateTime?`, `attemptToken: String?`, `lastErrorCode: String?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `FeedBookmark`

`userId: String`, `postId: String`, `createdAt: DateTime`, `user: User`, `post: FeedPost`

### model `FeedAuthorPreference`

`userId: String`, `authorId: String`, `hidden: Boolean`, `notify: Boolean`, `createdAt: DateTime`, `updatedAt: DateTime`, `user: User`, `author: User`

### model `FeedReport`

`id: String`, `reporterId: String`, `authorId: String`, `targetType: String`, `targetId: String`, `postId: String`, `snapshotText: String`, `reason: String`, `comment: String`, `status: String`, `resolution: String?`, `resolutionReason: String?`, `moderatorId: String?`, `resolvedAt: DateTime?`, `createdAt: DateTime`

### model `FeedModerationAction`

`id: String`, `moderatorId: String`, `reportId: String`, `action: String`, `reason: String`, `createdAt: DateTime`

### model `TransactionalMailAttempt`

`id: String`, `providerMessageId: String?`, `recipientCount: Int`, `status: String`, `errorCode: String?`, `createdAt: DateTime`, `acceptedAt: DateTime?`

### model `TransactionalMailOutbox`

`id: String`, `status: String`, `ciphertext: String?`, `nonce: String?`, `authTag: String?`, `category: String`, `createdAt: DateTime`, `expiresAt: DateTime`, `nextAttemptAt: DateTime`, `attempts: Int`, `leaseOwner: String?`, `leaseExpiresAt: DateTime?`, `lastErrorCode: String?`, `acceptedAt: DateTime?`

### model `TransactionalMailEvent`

`id: String`, `providerMessageId: String`, `type: String`, `occurredAt: DateTime`, `receivedAt: DateTime`, `errorCode: String?`

### model `CourseContentRevision`

`id: Int`, `revision: BigInt`

### model `OfflineMutationReceipt`

`id: String`, `ownerId: String`, `eventId: String`, `method: String`, `operation: String`, `resourceKey: String`, `payloadHash: String`, `state: String`, `revision: BigInt?`, `responseStatus: Int?`, `responseBody: Json?`, `createdAt: DateTime`, `committedAt: DateTime?`, `expiresAt: DateTime?`, `owner: User`, `preventionBindings: OfflinePreventionClientBinding[]`, `effects: OfflineMutationEffect[]`

### model `OfflineResourceRevision`

`ownerId: String`, `resourceKey: String`, `revision: BigInt`, `videoLastPositionSec: Int?`, `videoRecordedAt: DateTime?`, `owner: User`

### model `OfflinePreventionClientBinding`

`id: String`, `ownerId: String`, `petId: String`, `clientId: String`, `payloadHash: String`, `receiptId: String`, `createdAt: DateTime`, `pet: Pet`, `receipt: OfflineMutationReceipt`

### model `OfflineMutationEffect`

`id: String`, `ownerId: String`, `eventId: String`, `kind: String`, `status: String`, `payload: Json`, `attempts: Int`, `availableAt: DateTime`, `createdAt: DateTime`, `updatedAt: DateTime`, `receipt: OfflineMutationReceipt`

### model `PetCreateReceipt`

`ownerId: String`, `clientRequestId: String`, `payloadHash: String`, `petId: String`, `responseStatus: Int`, `responseJson: Json`, `createdAt: DateTime`, `owner: User`

### model `PetMediaDeletionIntent`

`id: String`, `ownerId: String`, `petId: String`, `dedupeKey: String`, `provider: String`, `locator: String`, `reason: String`, `status: String`, `attempts: Int`, `availableAt: DateTime`, `attemptToken: String?`, `leaseUntil: DateTime?`, `errorCode: String?`, `createdAt: DateTime`, `updatedAt: DateTime`

### enum `Chat2Kind`

`DIRECT`, `CYNOLOGIST`, `COMMUNITY`, `COURSE`, `COURSE_TOPIC`, `CITY`, `BREED`, `GROUP`

### enum `Chat2Visibility`

`PUBLIC`, `PRIVATE`, `UNLISTED`

### model `Chat2Conversation`

`id: String`, `kind: Chat2Kind`, `visibility: Chat2Visibility`, `name: String?`, `description: String?`, `avatarMediaId: String?`, `directKey: String?`, `scopeKey: String?`, `createdById: String?`, `createdBy: User?`, `nextSequence: BigInt`, `createdAt: DateTime`, `updatedAt: DateTime`, `members: Chat2Member[]`, `messages: Chat2Message[]`, `topics: Chat2Topic[]`, `media: Chat2Media[]`, `outbox: Chat2OutboxEvent[]`, `reports: Chat2Report[]`

### model `Chat2Member`

`id: String`, `conversationId: String`, `userId: String`, `role: String`, `joinedAt: DateTime`, `lastReadSequence: BigInt`, `mutedUntil: DateTime?`, `hiddenAt: DateTime?`, `conversation: Chat2Conversation`, `user: User`

### model `Chat2Message`

`id: String`, `conversationId: String`, `sequence: BigInt`, `authorId: String`, `clientMessageId: String`, `text: String`, `replyToId: String?`, `createdAt: DateTime`, `editedAt: DateTime?`, `deletedAt: DateTime?`, `conversation: Chat2Conversation`, `author: User`, `attachments: Chat2Media[]`, `pushReceipts: Chat2PushReceipt[]`, `reports: Chat2Report[]`, `reactions: Chat2MessageReaction[]`

### model `Chat2MessageReaction`

`messageId: String`, `userId: String`, `emoji: String`, `createdAt: DateTime`, `message: Chat2Message`, `user: User`

### model `Chat2Media`

`id: String`, `messageId: String?`, `conversationId: String`, `ownerId: String`, `objectKey: String`, `name: String`, `kind: String`, `mime: String`, `bytes: Int`, `status: String`, `createdAt: DateTime`, `message: Chat2Message?`, `owner: User`, `conversation: Chat2Conversation`

### model `Chat2MediaDeletionIntent`

`objectKey: String`, `status: String`, `attempts: Int`, `availableAt: DateTime`, `claimedUntil: DateTime?`, `completedAt: DateTime?`, `errorCode: String?`, `createdAt: DateTime`

### model `Chat2Report`

`id: String`, `reporterId: String`, `conversationId: String`, `messageId: String`, `reason: String`, `comment: String`, `status: String`, `createdAt: DateTime`, `updatedAt: DateTime`, `reporter: User`, `conversation: Chat2Conversation`, `message: Chat2Message`

### model `Chat2Topic`

`id: String`, `conversationId: String`, `title: String`, `createdAt: DateTime`, `conversation: Chat2Conversation`

### model `Chat2Block`

`blockerId: String`, `blockedId: String`, `createdAt: DateTime`, `blocker: User`, `blocked: User`

### model `Chat2OutboxEvent`

`id: String`, `conversationId: String`, `messageId: String?`, `eventType: String`, `createdAt: DateTime`, `deliveredAt: DateTime?`, `attempts: Int`, `nextAttemptAt: DateTime`, `claimedUntil: DateTime?`, `conversation: Chat2Conversation`

### model `Chat2PushReceipt`

`messageId: String`, `recipientId: String`, `notificationId: String?`, `createdAt: DateTime`, `message: Chat2Message`, `recipient: User`

### model `Chat2V2MediaTask`

`mediaId: String`, `conversationId: String`, `ownerId: String`, `name: String`, `sourceKey: String`, `sourceMime: String`, `sourceBytes: Int`, `status: String`, `attemptToken: String?`, `leaseUntil: DateTime?`, `attempts: Int`, `nextAttemptAt: DateTime`, `manifest: Json?`, `errorCode: String?`, `cleanupKind: String?`, `cleanupToken: String?`, `cleanupLeaseUntil: DateTime?`, `cleanupNextAt: DateTime`, `cleanupAttempts: Int`, `cleanupCompletedAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`

### model `QuestionV2MediaTask`

`mediaId: String`, `photoId: String`, `ownerId: String`, `sourceKey: String`, `sourceMime: String`, `sourceBytes: Int`, `status: String`, `attemptToken: String?`, `leaseUntil: DateTime?`, `attempts: Int`, `nextAttemptAt: DateTime`, `manifest: Json?`, `errorCode: String?`, `cleanupKind: String?`, `cleanupToken: String?`, `cleanupLeaseUntil: DateTime?`, `cleanupNextAt: DateTime`, `cleanupAttempts: Int`, `cleanupCompletedAt: DateTime?`, `createdAt: DateTime`, `updatedAt: DateTime`

Проверка relations, default, indexes, onDelete и схем миграций только по оригинальному файлу. Любые production migrations требуют отдельного разрешения.
