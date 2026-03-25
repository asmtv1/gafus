"use client";

import { PasswordInput } from "@shared/components/ui/PasswordInput";
import {
  submitDeleteUserAccount,
  type DeleteUserAccountActionState,
} from "@shared/lib/user/deleteUserAccount";
import { useActionState } from "react";

const initialState: DeleteUserAccountActionState = { success: false, error: "" };

export default function DeleteAccountForm() {
  const [state, formAction, isPending] = useActionState(submitDeleteUserAccount, initialState);

  return (
    <form action={formAction} style={{ marginTop: "1.5rem" }}>
      <div className="mb-4">
        <PasswordInput
          id="delete-account-password"
          placeholder="Текущий пароль"
          label="Текущий пароль для подтверждения"
          visuallyHiddenLabel={false}
          className="w-full"
          errorClassName="text-red-600 mt-1"
          autoComplete="current-password"
          name="password"
          required
        />
      </div>
      {state.success === false && state.error ? (
        <p className="text-red-600 mb-3" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="w-full py-3 px-4 rounded-xl font-semibold text-white border border-[#9a0007] shadow-md transition disabled:opacity-60"
        style={{
          background: "linear-gradient(135deg, #c62828 0%, #9a0007 100%)",
        }}
      >
        {isPending ? "Удаление…" : "Удалить навсегда"}
      </button>
    </form>
  );
}
