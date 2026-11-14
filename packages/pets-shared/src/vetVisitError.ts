/** Uniform 404: never disclose whether a pet, visit or private attachment exists. */
export class VetVisitDetailNotFoundError extends Error {
  readonly status = 404;
  readonly code = "VET_VISIT_NOT_FOUND";
  constructor() {
    super("Посещение не найдено");
  }
}
