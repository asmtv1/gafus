/** Admin-only query service. No conversation IDs, messages or actor data. */
export declare function listChatOutboxDeadLetters(): Promise<{
    id: string;
    attempts: number;
    createdAt: Date;
    operationId: string | null;
    eventType: string;
    lastErrorCode: string | null;
    traceId: string | null;
    deadLetteredAt: Date | null;
}[]>;
/** Atomic compare-and-swap: never reset a delivered, live or claimed event. */
export declare function retryChatOutboxDeadLetter(eventId: string): Promise<boolean>;
//# sourceMappingURL=chat2OutboxDiagnostics.d.ts.map