import { ApiError } from "../utils/ApiError.js";

/** Validate and coerce req[part] with a zod schema; replaces the original value with the parsed one. */
export const validate = (schema, part = "body") => (req, _res, next) => {
  const result = schema.safeParse(req[part] ?? {});
  if (!result.success) {
    const details = Object.fromEntries(result.error.issues.map((i) => [i.path.join(".") || part, i.message]));
    next(ApiError.badRequest("Invalid request", details));
    return;
  }
  if (part === "query") req.validatedQuery = result.data;
  else req[part] = result.data;
  next();
};
