type RequestWithUser = {
  user?: unknown;
};

type AccessArgs = {
  req: RequestWithUser;
};

export const isAdmin = ({ req }: AccessArgs): boolean => Boolean(req.user);

// Use for reference data that must always be readable by admin relationship fields.
export const allowRead = (): boolean => true;
