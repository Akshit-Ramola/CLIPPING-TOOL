import axios from "axios";

export const http = axios.create({ baseURL: "/api", timeout: 60_000 });

/** Normalise server errors ({ error: { message, details } }) into a readable Error. */
http.interceptors.response.use(
  (response) => response,
  (error) => {
    const payload = error.response?.data?.error;
    const details = payload?.details ? Object.entries(payload.details).map(([k, v]) => `${k}: ${v}`).join("; ") : "";
    const message = payload?.message
      ? `${payload.message}${details ? ` — ${details}` : ""}`
      : error.code === "ERR_NETWORK"
        ? "Cannot reach the API server. Is it running on port 5000?"
        : error.message;
    return Promise.reject(Object.assign(new Error(message), { status: error.response?.status }));
  },
);

export const data = (promise) => promise.then((r) => r.data);
