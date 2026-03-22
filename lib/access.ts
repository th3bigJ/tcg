import type { Access, PayloadRequest } from "payload";

type RequestWithUser = {
  user?: unknown;
};

type AccessArgs = {
  req: RequestWithUser;
};

export const isAdmin = ({ req }: AccessArgs): boolean => Boolean(req.user);

/** Synchronous check: is the request authenticated as a Payload admin (`users` auth collection)? */
export function isPayloadAdminUser(req: PayloadRequest): boolean {
  const u = req.user;
  return Boolean(
    u &&
      typeof u === "object" &&
      "collection" in u &&
      (u as { collection: string }).collection === "users",
  );
}

/** For `access.create` / `read` / `update` / `delete` — same logic as {@link isPayloadAdminUser}. */
export const isAdminUser: Access = ({ req }) => isPayloadAdminUser(req);

// Use for reference data that must always be readable by admin relationship fields.
export const allowRead = (): boolean => true;
