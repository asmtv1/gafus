-- The account-deletion audit is a durable append-only ledger.
-- Protect UPDATE, DELETE and TRUNCATE from application SQL, including Prisma.
-- Privileged database owners can still alter triggers; this is not WORM storage.
CREATE FUNCTION "guard_account_deletion_audit_append_only"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ACCOUNT_DELETION_AUDIT_IMMUTABLE'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER "AccountDeletionAudit_append_only_row"
BEFORE UPDATE OR DELETE ON "AccountDeletionAudit"
FOR EACH ROW
EXECUTE FUNCTION "guard_account_deletion_audit_append_only"();

CREATE TRIGGER "AccountDeletionAudit_append_only_truncate"
BEFORE TRUNCATE ON "AccountDeletionAudit"
FOR EACH STATEMENT
EXECUTE FUNCTION "guard_account_deletion_audit_append_only"();
