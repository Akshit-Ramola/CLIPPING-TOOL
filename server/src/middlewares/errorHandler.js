import mongoose from "mongoose";
import multer from "multer";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message || "Internal server error";
  let details = err.details;

  if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = "Validation failed";
    details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = `Upload error: ${err.message}`;
  }

  if (status >= 500 && !(err instanceof ApiError)) logger.error(err);
  res.status(status).json({ error: { message, ...(details ? { details } : {}) } });
}
