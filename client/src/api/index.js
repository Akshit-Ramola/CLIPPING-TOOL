import { data, http } from "./client.js";

export const systemApi = {
  status: () => data(http.get("/system/status")),
};

export const streamsApi = {
  search: (q, max = 25) => data(http.get("/streams/search", { params: { q, max } })),
};

export const jobsApi = {
  list: (params) => data(http.get("/jobs", { params })),
  get: (id) => data(http.get(`/jobs/${id}`)),
  createFromUrl: (body) => data(http.post("/jobs", body)),
  createFromFile: (file, options, onUploadProgress) => {
    const form = new FormData();
    form.append("video", file);
    form.append("options", JSON.stringify(options));
    return data(http.post("/jobs/file", form, { timeout: 0, onUploadProgress }));
  },
  stop: (id) => data(http.post(`/jobs/${id}/stop`)),
  remove: (id) => data(http.delete(`/jobs/${id}`)),
};

export const clipsApi = {
  list: (params) => data(http.get("/clips", { params })),
  get: (id) => data(http.get(`/clips/${id}`)),
  update: (id, body) => data(http.patch(`/clips/${id}`, body)),
  remove: (id) => data(http.delete(`/clips/${id}`)),
  publish: (id, body) => data(http.post(`/clips/${id}/publish`, body, { timeout: 0 })),
};

export const rendersApi = {
  list: (params) => data(http.get("/renders", { params })),
  get: (id) => data(http.get(`/renders/${id}`)),
  create: ({ facecam, gameplay, captions, options }, onUploadProgress) => {
    const form = new FormData();
    form.append("facecam", facecam);
    form.append("gameplay", gameplay);
    if (captions) form.append("captions", captions);
    Object.entries(options).forEach(([k, v]) => form.append(k, String(v)));
    return data(http.post("/renders", form, { timeout: 0, onUploadProgress }));
  },
  remove: (id) => data(http.delete(`/renders/${id}`)),
};
